//
// Copyright (c) 2024, Psiphon Inc.
// All rights reserved.
//


import Testing
@testable import Conduit


private let globalModule: ConduitModule = {
    return ConduitModule()
}()

func getGlobalModule() -> ConduitModule {
    return globalModule
}


/// Covers the expected behaviour of exported methods through the React Native bridge interface.
@Suite(.serialized) final class ConduitModuleTests {
    
    // ConduitModule's logging system can only be initialized once per process,
    // hence needing a global instance.
    let module: ConduitModule = getGlobalModule()
    
    struct RejectResult {
        var code: String?
        var message: String?
        var error: Error?
    }
    
    var resolveResult: Any? = nil
    var rejectResult: RejectResult = RejectResult()
    lazy var resolve: RCTPromiseResolveBlock = { [weak self] result in
        self?.resolveResult = result
    }
    
    lazy var reject: RCTPromiseRejectBlock = { [weak self] code, message, error in
        self?.rejectResult.code = code
        self?.rejectResult.message = message
        self?.rejectResult.error = error
    }
    
    init() {
        // Emptying logs from active TestLoggers' storage before each test
        // without destroying the global objects themselves.
        TestLogger.emptyLoggers()
    }
    
    @Test("logInfo success")
    func logInfoSuccess() {
        
        module.logInfo("LabelInfo", msg: "info message", resolve: resolve, reject: reject)
        
        #expect(
            resolveResult == nil,
            "Unexpected resolve result: \(resolveResult)"
        )
        #expect(
            rejectResult.code == nil,
            "Unexpected reject code: \(rejectResult.code)"
        )
        #expect(
            rejectResult.message == nil,
            "Unexpected reject message: \(rejectResult.message)"
        )

        #expect(
            TestLogger.getLoggers().keys.contains("LabelInfo") == true,
            "Did not get expected log label: LabelInfo)"
        )

        let testLoggers = TestLogger.getLoggers()
        let testLogger: TestLogger = testLoggers["LabelInfo"]!
        let logs = testLogger.getCapturedLogs()

        #expect(
            logs[0].message == "info message",
            "Did not get expected log message: info message)"
        )
        #expect(
            logs[0].level == .info,
            "Did not get expected log level: .info)"
        )
    }
    
    @Test("logWarn success")
    func logWarnSuccess() {

        module.logWarn("LabelWarn", msg: "warn message", resolve: resolve, reject: reject)
        
        #expect(
            resolveResult == nil,
            "Unexpected resolve result: \(resolveResult)"
        )
        #expect(
            rejectResult.code == nil,
            "Unexpected reject code: \(rejectResult.code)"
        )
        #expect(
            rejectResult.message == nil,
            "Unexpected reject message: \(rejectResult.message)"
        )

        #expect(
            TestLogger.getLoggers().keys.contains("LabelWarn") == true,
            "Unexpected log label: LabelWarn)"
        )

        let testLoggers = TestLogger.getLoggers()
        let testLogger: TestLogger = testLoggers["LabelWarn"]!
        let logs = testLogger.getCapturedLogs()

        #expect(
            logs.count == 1,
            "Unexpected log count: \(logs.count)"
        )
        #expect(
            logs[0].message == "warn message",
            "Unexpected log message: \(logs[0].message)"
        )
        #expect(
            logs[0].level == .warning,
            "Unexpected log level: \(logs[0].level)"
        )
    }

    @Test("logError success")
    func logErrorSuccess() {
        
        module.logError("LabelError", msg: "error message", resolve: resolve, reject: reject)
        
        #expect(
            resolveResult == nil,
            "Unexpected resolve result: \(resolveResult)"
        )
        #expect(
            rejectResult.code == nil,
            "Unexpected reject code: \(rejectResult.code)"
        )
        #expect(
            rejectResult.message == nil,
            "Unexpected reject message: \(rejectResult.message)"
        )

        #expect(
            TestLogger.getLoggers().keys.contains("LabelError") == true,
            "Test logger with expected label not found"
        )
        let testLogger = TestLogger.getLoggers()["LabelError"]!
        let logs = testLogger.getCapturedLogs()

        #expect(
            logs.count == 1,
            "Unexpected log count: \(logs.count)"
        )
        #expect(
            logs[0].level == .error,
            "Unexpected log level: \(logs[0].level)"
        )
        #expect(
            logs[0].message == "error message",
            "Unexpected log message: \(logs[0].message)"
        )
    }
    
    @Test("paramsChanged success from stopped")
    func paramsChangedSuccessStopped() {
        let params = NSDictionary(
            dictionary: [
                "maxClients": 1,
                "limitUpstreamBytesPerSecond": 1,
                "limitDownstreamBytesPerSecond": 1,
                "privateKey": "string" // TODO! should this invoke rejection?
            ]
        )

        module.paramsChanged(params, resolve: resolve, reject: reject)

        #expect(
            resolveResult == nil,
            "Unexpected resolve result: \(resolveResult)"
        )
        #expect(
            rejectResult.code == nil,
            "Unexpected reject code: \(rejectResult.code)"
        )
        #expect(
            rejectResult.message == nil,
            "Unexpected reject message: \(rejectResult.message)"
        )
    }
    
    @Test("paramsChanged with invalid params", arguments: [
        ["wrong key": ""],
        [
            "maxClients": "wrong type",
            "limitUpstreamBytesPerSecond": "wrong type",
            "limitDownstreamBytesPerSecond": "wrong type",
            "privateKey": 1
        ],
        [:]
    ])
    func paramsChangedInvalidParams(invalidParams: [AnyHashable : Any]) {
        let params = NSDictionary(dictionary: invalidParams)
        
        module.paramsChanged(params, resolve: resolve, reject: reject)

        #expect(
            rejectResult.code == "error",
            "Unexpected reject code: \(rejectResult.code)"
        )
        #expect(
            rejectResult.message == "params NSDictionary could not be loaded into ConduitParams.",
            "Unexpected reject message: \(rejectResult.message)"
        )
        #expect(
            rejectResult.error == nil,
            "Unexpected reject error: \(rejectResult.error)"
        )

        #expect(
            TestLogger.getLoggers().keys.contains("ConduitModule") == true,
            "Test logger with expected label not found"
        )
        let testLogger = TestLogger.getLoggers()["ConduitModule"]!
        let logs = testLogger.getCapturedLogs()

        #expect(
            logs.count == 1,
            "Unexpected log count: \(logs.count)"
        )
        #expect(
            logs[0].level == .warning,
            "Unexpected log level: \(logs[0].level)"
        )
        #expect( 
            logs[0].message == "NSDictionary to ConduitParams conversion failed.",
            "Unexpected log message: \(logs[0].message)"
        )
    }
    
    @Test("toggleInProxy with invalid params", arguments: [
        ["wrong key": ""],
        [
            "maxClients": "wrong type",
            "limitUpstreamBytesPerSecond": "wrong type",
            "limitDownstreamBytesPerSecond": "wrong type",
            "privateKey": 1
        ],
        [:]
    ])
    func toggleInProxyInvalidParams(invalidParams: [AnyHashable : Any]) {
        let params = NSDictionary(dictionary: invalidParams)
        
        module.toggleInProxy(params, resolve: resolve, reject: reject)

        #expect(
            rejectResult.code == "error",
            "Unexpected reject code: \(rejectResult.code)"
        )
        #expect(
            rejectResult.message == "params NSDictionary could not be loaded into ConduitParams.",
            "Unexpected reject message: \(rejectResult.message)"
        )
        #expect(
            rejectResult.error == nil,
            "Unexpected reject error: \(rejectResult.error)"
        )

        #expect(
            TestLogger.getLoggers().keys.contains("ConduitModule") == true,
            "Test logger with expected label not found"
        )
        let testLogger = TestLogger.getLoggers()["ConduitModule"]!
        let logs = testLogger.getCapturedLogs()

        #expect(
            logs.count == 1,
            "Unexpected log count: \(logs.count)"
        )
        #expect(
            logs[0].level == .warning,
            "Unexpected log level: \(logs[0].level)"
        )
        #expect(
            logs[0].message == "NSDictionary to ConduitParams conversion failed.",
            "Unexpected log message: \(logs[0].message)"
        )
    }
    
    // TODO! paramsChanged success tests from stopping, starting and started.
    // TODO! toggleInProxy success tests from stopped, stopping, starting and started.
    // TODO! toggleInProxy success tests from stopping, starting and started.
    // TODO! toggleInProxy restart failed rejection from started.
    // TODO! sendFeedback all expected behaviour.
}


/// Internal unit tests for debugging purposes
@Test("noticesFilePath with invalid URL", arguments: [
    URL(fileURLWithPath: "/path/to/nonexistent/file"),
    URL(string: "file://path/to/some%ZZinvalidEncoding")!,
    URL(fileURLWithPath: "~/relative/path/to/resource"),
    URL(string: "file:///path/with space/resource")!,
    URL(fileURLWithPath: "/dev/null"),
    URL(string: "ftp://example.com/resource")!,
    URL(fileURLWithPath: "/Users/enda-forever/path/to/restricted/"),
    URL(fileURLWithPath: "/path/" + String(repeating: "a", count: 3000))
])
func noticesFilePathInvalidURL(invalidFileURL: URL){
    let result = noticesFilePath(dataRootDirectory: invalidFileURL)
    #expect(result != nil, "Expected result to not be nil")
}
