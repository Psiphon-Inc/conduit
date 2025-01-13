//
// Copyright (c) 2024, Psiphon Inc.
// All rights reserved.
//

import Logging
import Testing

@testable import Conduit


/// Mocks inherited logic which requires React Native bridge context.
/// Replaces the app's multiplex logger with test logger.
final class ConduitModuleMock: ConduitModule {
    
    var sentEvents = [ConduitEvent]()
    override func sendEvent(_ event: ConduitEvent) {
        sentEvents.append(event)
    }
    
    override func setupLoggingSystem(){
        LoggingSystem.bootstrap { label -> LogHandler in
            TestLogger(
                label: label,
                logLevel: AppLogger.minLogLevel
            )
        }
    }
}


/// The module's logging system can only be initialized once
/// per process, hence needing a global instance for test suite.
private let globalModule: ConduitModuleMock = {
    return ConduitModuleMock()
}()

func getGlobalModule() -> ConduitModuleMock {
    return globalModule
}


/// Covers the expected behaviour of ConduitModule's exported methods.
/// If requirement is not met, the test suite is responsible.
/// If expectation is not met, the implementation is responsible.
@Suite(.serialized) final class ConduitModuleTests {
    
    // Setup note: React Native layer is simulated here, and must
    // not be running on dev server out of scope.
    private let module: ConduitModuleMock = getGlobalModule()

    struct RejectResult {
        var code: String?
        var message: String?
        var error: Error?
    }

    var resolveVal: Any? = nil
    var rejectVal: RejectResult = RejectResult()
    lazy var resolve: RCTPromiseResolveBlock = {  [weak self] result in
        self?.resolveVal = result
    }
    lazy var reject: RCTPromiseRejectBlock = {  [weak self] code, message, error in
        self?.rejectVal.code = code
        self?.rejectVal.message = message
        self?.rejectVal.error = error
    }
    
    // Used to resume a suspended test once its call to an
    // promise driven function completes.
    var testContinuation: CheckedContinuation<Void, Never>?

    var pendingResolveVal: Any? = nil
    var pendingRejectVal: RejectResult = RejectResult()
    
    lazy var pendingResolve: RCTPromiseResolveBlock = { [weak self] result in
        self?.pendingResolveVal = result
        self?.testContinuation?.resume()
    }

    lazy var pendingReject: RCTPromiseRejectBlock = { [weak self] code, message, error in
        self?.pendingRejectVal.code = code
        self?.pendingRejectVal.message = message
        self?.pendingRejectVal.error = error
        self?.testContinuation?.resume()
    }
    
    func isExpectedEvent(_ result: ConduitEvent, expected: ConduitEvent) -> Bool {
        switch (result, expected) {
        case let (.proxyState(res), .proxyState(exp)):
            return res.status == exp.status && res.networkState == exp.networkState
        case let (.proxyError(res), .proxyError(exp)):
            return res == exp
        default:
            // No current tests for activity stat events
            return false
        }
    }
    
    func ensureStatus(_ requiredStatus: ConduitManager.ConduitStatus) async -> Bool {
        let params = NSDictionary(
            dictionary: [
                "maxClients": 1,
                "limitUpstreamBytesPerSecond": 1,
                "limitDownstreamBytesPerSecond": 1,
                "privateKey": "test_pk"
            ]
        )
        
        var currentStatus = await module.conduitManager.conduitStatus
        if currentStatus != requiredStatus {
            await withCheckedContinuation { continuation in
                testContinuation = continuation
                module.toggleInProxy(params, resolve: pendingResolve, reject: pendingReject)
            }
        }
        
        currentStatus = await module.conduitManager.conduitStatus
        return currentStatus == requiredStatus
    }
    
    deinit {
        // Emptying logs from active TestLoggers' storage before each
        // test without destroying the global objects themselves.
        TestLogger.emptyLoggers()
        
        module.sentEvents.removeAll()
    }
    
    @Test("logInfo success")
    func logInfoSuccess() async throws {
        await withCheckedContinuation { continuation in
            testContinuation = continuation
            module.logInfo("LabelInfo", msg: "info message", resolve: pendingResolve, reject: pendingReject)
        }
        
        #expect(pendingResolveVal == nil, "Unexpected resolve result")
        #expect(pendingRejectVal.code == nil, "Unexpected reject code")
        #expect(pendingRejectVal.message == nil, "Unexpected reject message")

        let testLoggers = TestLogger.getLoggers()
        try #require(
            testLoggers.keys.contains("LabelInfo") && testLoggers["LabelInfo"] != nil,
            "Required test logger not found"
        )

        let testLogger: TestLogger = testLoggers["LabelInfo"]!
        let capturedLogs = testLogger.getCapturedLogs()

        #expect(capturedLogs.count == 1, "Unexpected captured log count")
        #expect(capturedLogs[0].level == .info, "Unexpected captured log level")
        #expect(capturedLogs[0].message == "info message", "Unexpected captured log message")
    }
  
    @Test("logWarn success")
    func logWarnSuccess() async throws {
        await withCheckedContinuation { continuation in
            testContinuation = continuation
            module.logWarn("LabelWarn", msg: "warn message", resolve: pendingResolve, reject: pendingReject)
        }
        
        #expect(pendingResolveVal == nil, "Unexpected resolve result")
        #expect(pendingRejectVal.code == nil, "Unexpected reject code")
        #expect(pendingRejectVal.message == nil, "Unexpected reject message")
        
        let testLoggers = TestLogger.getLoggers()
        try #require(
            testLoggers.keys.contains("LabelWarn") && testLoggers["LabelWarn"] != nil,
            "Required test logger not found"
        )

        let testLogger: TestLogger = testLoggers["LabelWarn"]!
        let capturedLogs = testLogger.getCapturedLogs()

        #expect(capturedLogs.count == 1, "Unexpected captured log count")
        #expect(capturedLogs[0].level == .warning, "Unexpected captured log level")
        #expect(capturedLogs[0].message == "warn message", "Unexpected captured log message")
    }
    
    @Test("logError success")
    func logErrorSuccess() async throws {
        await withCheckedContinuation { continuation in
            testContinuation = continuation
            module.logError("LabelError", msg: "error message", resolve: pendingResolve, reject: pendingReject)
        }
        
        #expect(pendingResolveVal == nil, "Unexpected resolve result")
        #expect(pendingRejectVal.code == nil, "Unexpected reject code")
        #expect(pendingRejectVal.message == nil, "Unexpected reject message")

        let testLoggers = TestLogger.getLoggers()
        try #require(
            testLoggers.keys.contains("LabelError") && testLoggers["LabelError"] != nil,
            "Required test logger not found"
        )
        
        let testLogger = testLoggers["LabelError"]!
        let capturedLogs = testLogger.getCapturedLogs()

        #expect(capturedLogs.count == 1, "Unexpected captured log count")
        #expect(capturedLogs[0].level == .error, "Unexpected captured log level")
        #expect(capturedLogs[0].message == "error message", "Unexpected captured log message")
    }
    
    @Test("toggleInProxy success from stopped and started")
    func toggleInProxySuccess() async throws {
        let params = NSDictionary(
            dictionary: [
                "maxClients": 1,
                "limitUpstreamBytesPerSecond": 1,
                "limitDownstreamBytesPerSecond": 1,
                "privateKey": "test_pk"
            ]
        )
        
        try #require(await ensureStatus(.stopped), "Required conduit manager status not met")
        module.sentEvents.removeAll()
        
        // Test toggle from stopped status
        await withCheckedContinuation { continuation in
            testContinuation = continuation
            module.toggleInProxy(params, resolve: pendingResolve, reject: pendingReject)
        }
        
        #expect(pendingResolveVal == nil, "Unexpected resolve result")
        #expect(pendingRejectVal.code == nil, "Unexpected reject code")
        #expect(pendingRejectVal.message == nil, "Unexpected reject message")
        
        var managerStatus = await module.conduitManager.conduitStatus
        #expect(managerStatus == .started, "Unexpected conduit manager status result")
        
        #expect(
            module.sentEvents.filter { $0.asDictionary["type"] as! String == "proxyState" }.count == 2,
            "Unexpected proxy state event count"
        )
        
        #expect(
            isExpectedEvent(module.sentEvents[0], expected: ConduitEvent.proxyState(
                ReactProxyState(
                    status: Conduit.ReactProxyState.Status.RUNNING,
                    networkState: nil
                )
            )),
            "Expected proxy state event for starting status not found"
        )
        #expect(
            isExpectedEvent(module.sentEvents[1], expected: ConduitEvent.proxyState(
                ReactProxyState(
                    status: Conduit.ReactProxyState.Status.RUNNING,
                    networkState: Conduit.ReactProxyState.NetworkState.HAS_INTERNET
                )
            )),
            "Expected proxy state event for started status not found"
        )
        // End test toggle from stopped status
        
        try #require(await ensureStatus(.started), "Required conduit manager status not met")
        module.sentEvents.removeAll()
        
        // Test toggle from started status
        await withCheckedContinuation { continuation in
            testContinuation = continuation
            module.toggleInProxy(params, resolve: pendingResolve, reject: pendingReject)
        }
        
        #expect(pendingResolveVal == nil, "Unexpected resolve result")
        #expect(pendingRejectVal.code == nil, "Unexpected reject code")
        #expect(pendingRejectVal.message == nil, "Unexpected reject message")
        
        managerStatus = await module.conduitManager.conduitStatus
        #expect(managerStatus == .stopped, "Unexpected conduit manager status result")
        
        #expect(
            module.sentEvents.filter { $0.asDictionary["type"] as! String == "proxyState" }.count == 2,
            "Unexpected proxy state event count"
        )
        
        #expect(
            isExpectedEvent(module.sentEvents[0], expected: ConduitEvent.proxyState(
                ReactProxyState(
                    status: Conduit.ReactProxyState.Status.STOPPED,
                    networkState: Conduit.ReactProxyState.NetworkState.HAS_INTERNET
                )
            )),
            "Expected proxy state event for stopping status not found"
        )
        #expect(
            isExpectedEvent(module.sentEvents[1], expected: ConduitEvent.proxyState(
                ReactProxyState(
                    status: Conduit.ReactProxyState.Status.STOPPED,
                    networkState: nil
                )
            )),
            "Expected proxy state event for stopped status not found"
        )
        // End test toggle from started status
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
    func toggleInProxyInvalidParams(invalidParams: [AnyHashable : Any]) async throws {
        let params = NSDictionary(dictionary: invalidParams)

        await withCheckedContinuation { continuation in
            testContinuation = continuation
            module.toggleInProxy(params, resolve: pendingResolve, reject: pendingReject)
        }

        #expect(pendingRejectVal.code == "error", "Expected reject code not found")
        #expect(
            pendingRejectVal.message == "params NSDictionary could not be loaded into ConduitParams.",
            "Expected reject message not found"
        )
        #expect(pendingRejectVal.error == nil, "Unexpected reject error")
    }

    @Test("toggleInProxy start failed with proxy error")
    func toggleInProxyStartFailed() async throws {

        let breakingParams = NSDictionary(
            dictionary: [
                "maxClients": -1,
                "limitUpstreamBytesPerSecond": 1,
                "limitDownstreamBytesPerSecond": 1,
                "privateKey": "test_pk"
            ]
        )

        try #require(await ensureStatus(.stopped), "Required conduit manager status not met")
        module.sentEvents.removeAll()

        // Test breaking toggle from stopped status
        await withCheckedContinuation { continuation in
            testContinuation = continuation
            module.toggleInProxy(breakingParams, resolve: pendingResolve, reject: pendingReject)
        }

        #expect(pendingResolveVal == nil, "Unexpected resolve result")
        #expect(pendingRejectVal.code == "error", "Expected reject code not found")
        #expect(pendingRejectVal.message == "Proxy start failed.", "Expected reject message not found")

        let managerStatus = await module.conduitManager.conduitStatus
        #expect(managerStatus == .stopped, "Unexpected conduit manager status result")

        #expect(
            module.sentEvents.filter { $0.asDictionary["type"] as! String == "proxyState" }.count == 2,
            "Unexpected proxy state event count"
        )
        #expect(
            module.sentEvents.filter { $0.asDictionary["type"] as! String == "proxyError" }.count == 1,
            "Unexpected proxy error event count"
        )
        #expect(
            isExpectedEvent(module.sentEvents[0], expected: ConduitEvent.proxyState(
                ReactProxyState(
                    status: Conduit.ReactProxyState.Status.RUNNING,
                    networkState: nil
                )
            )),
            "Expected proxy state event for starting status not found"
        )
        #expect(
            isExpectedEvent(module.sentEvents[1], expected: ConduitEvent.proxyState(
                ReactProxyState(
                    status: Conduit.ReactProxyState.Status.STOPPED,
                    networkState: nil
                )
            )),
            "Expected proxy state event for stopped status not found"
        )
        #expect(
            isExpectedEvent(
                module.sentEvents[2],
                expected: ConduitEvent.proxyError(Conduit.ReactProxyError.inProxyStartFailed)
            ),
            "Expected proxy error event not found"
        )
        // End test breaking toggle from stopped status
    }

    @Test("paramsChanged success from stopped and started")
    func paramsChangedSuccess() async throws {
        let newParams = NSDictionary(
            dictionary: [
                "maxClients": 2,
                "limitUpstreamBytesPerSecond": 2,
                "limitDownstreamBytesPerSecond": 2,
                "privateKey": "test_pk_new"
            ]
        )

        try #require(await ensureStatus(.stopped), "Required conduit manager status not met")
        module.sentEvents.removeAll()

        // Test change params from stopped status (no-op)
        await withCheckedContinuation { continuation in
            testContinuation = continuation
            module.paramsChanged(newParams, resolve: pendingResolve, reject: pendingReject)
        }

        #expect(pendingResolveVal == nil, "Unexpected resolve result")
        #expect(pendingRejectVal.code == nil, "Unexpected reject code")
        #expect(pendingRejectVal.message == nil, "Unexpected reject message")

        #expect(
            module.sentEvents.filter { $0.asDictionary["type"] as! String == "proxyState" }.count == 0,
            "Unexpected proxy state event count"
        )

        var managerStatus = await module.conduitManager.conduitStatus
        #expect(managerStatus == .stopped, "Unexpected conduit manager status result")
        // End test change params from stopped status (no-op)

        try #require(await ensureStatus(.started), "Required conduit manager status not met")
        module.sentEvents.removeAll()

        // Test change params from started status
        await withCheckedContinuation { continuation in
            testContinuation = continuation
            module.paramsChanged(newParams, resolve: pendingResolve, reject: pendingReject)
        }

        #expect(pendingResolveVal == nil, "Unexpected resolve result")
        #expect(pendingRejectVal.code == nil, "Unexpected reject code")
        #expect(pendingRejectVal.message == nil, "Unexpected reject message")

        #expect(
            module.sentEvents.filter { $0.asDictionary["type"] as! String == "proxyState" }.count == 2,
            "Unexpected proxy state event count"
        )

        #expect(
            isExpectedEvent(module.sentEvents[0], expected: ConduitEvent.proxyState(
                ReactProxyState(
                    status: Conduit.ReactProxyState.Status.RUNNING,
                    networkState: Conduit.ReactProxyState.NetworkState.HAS_INTERNET
                )
            )),
            "Expected event for starting status with uninterupted network state not found"
        )
        #expect(
            isExpectedEvent(module.sentEvents[1], expected: ConduitEvent.proxyState(
                ReactProxyState(
                    status: Conduit.ReactProxyState.Status.RUNNING,
                    networkState: Conduit.ReactProxyState.NetworkState.HAS_INTERNET
                )
            )),
            "Expected event for started status not found"
        )

        managerStatus = await module.conduitManager.conduitStatus
        #expect(managerStatus == .started, "Unexpected conduit manager status result")
        // End test change params from started status
    }
    
    @Test("paramsChanged with invalid params", arguments: [
        ["wrongkey": ""],
        [
            "maxClients": "wrong type",
            "limitUpstreamBytesPerSecond": "wrong type",
            "limitDownstreamBytesPerSecond": "wrong type",
            "privateKey": 1
        ],
        [:]
    ])
    func paramsChangedInvalidParams(invalidParams: [AnyHashable : Any]) async {
        let params = NSDictionary(dictionary: invalidParams)

        module.paramsChanged(params, resolve: resolve, reject: reject)

        #expect(rejectVal.code == "error", "Expected reject code not found")
        #expect(
            rejectVal.message == "params NSDictionary could not be loaded into ConduitParams.",
            "Expected reject message not found"
        )
        #expect(rejectVal.error == nil, "Unexpected reject error")
    }

    @Test("paramsChanged restart failed with proxy error")
    func paramsChangedRestartFailed() async throws {

        let breakingParams = NSDictionary(
            dictionary: [
                "maxClients": -1,
                "limitUpstreamBytesPerSecond": 1,
                "limitDownstreamBytesPerSecond": 1,
                "privateKey": "test_pk"
            ]
        )

        try #require(await ensureStatus(.started), "Required conduit manager status not met")
        module.sentEvents.removeAll()

        // Test change params request with bad value
        await withCheckedContinuation { continuation in
            testContinuation = continuation
            module.paramsChanged(breakingParams, resolve: pendingResolve, reject: pendingReject)
        }

        #expect(pendingResolveVal == nil, "Unexpected resolve result")
        #expect(pendingRejectVal.code == "error", "Expected reject code not found")
        #expect(pendingRejectVal.message == "Proxy restart failed.", "Expected reject message not found")

        let managerStatus = await module.conduitManager.conduitStatus
        #expect(managerStatus == .stopped, "Unexpected conduit manager status result")

        #expect(
            module.sentEvents.filter { $0.asDictionary["type"] as! String == "proxyState" }.count == 2,
            "Unexpected proxy state event count"
        )
        #expect(
            module.sentEvents.filter { $0.asDictionary["type"] as! String == "proxyError" }.count == 1,
            "Unexpected proxy error event count"
        )

        #expect(
            isExpectedEvent(module.sentEvents[0], expected: ConduitEvent.proxyState(
                ReactProxyState(
                    status: Conduit.ReactProxyState.Status.RUNNING,
                    networkState: Conduit.ReactProxyState.NetworkState.HAS_INTERNET
                )
            )),
            "Expected event for starting status with uninterupted network state not found"
        )
        #expect(
            isExpectedEvent(module.sentEvents[1], expected: ConduitEvent.proxyState(
                ReactProxyState(
                    status: Conduit.ReactProxyState.Status.STOPPED,
                    networkState: nil
                )
            )),
            "Expected proxy state event for stopped status not found"
        )
        #expect(
            isExpectedEvent(
                module.sentEvents[2],
                expected: ConduitEvent.proxyError(Conduit.ReactProxyError.inProxyRestartFailed)
            ),
            "Expected proxy error event not found"
        )
        // End test change params request with bad value
    }
    
     @Test("toggleInProxy consecutive calls")
     func toggleInProxyConsecutiveSuccess() async throws {
        
         let params = NSDictionary(
             dictionary: [
                 "maxClients": 1,
                 "limitUpstreamBytesPerSecond": 1,
                 "limitDownstreamBytesPerSecond": 1,
                 "privateKey": "test_pk"
             ]
         )
        
         try #require(await ensureStatus(.stopped), "Required conduit manager status not met")
         module.sentEvents.removeAll()
        
         // Test consecutive toggles from stopped status
         module.toggleInProxy(params, resolve: resolve, reject: reject)
         await withCheckedContinuation { continuation in
             testContinuation = continuation
             module.toggleInProxy(params, resolve: pendingResolve, reject: pendingReject)
            
         }
        
         #expect(pendingResolveVal == nil, "Unexpected resolve result from second toggle")
         #expect(pendingRejectVal.code == nil, "Unexpected reject code from second toggle")
         #expect(pendingRejectVal.message == nil, "Unexpected reject message from second toggle")
        
         var managerStatus = await module.conduitManager.conduitStatus
         #expect(managerStatus == .starting, "Unexpected conduit manager status from second toggle")
        
         try #require(await Task.sleep(nanoseconds: 2000000000)) // ensure first toggle resolved
         #expect(resolveVal == nil, "Unexpected resolve result from first toggle")

         managerStatus = await module.conduitManager.conduitStatus
         #expect(managerStatus == .started, "Unexpected conduit manager status result from consecutive toggles")

         #expect(
             module.sentEvents.filter { $0.asDictionary["type"] as! String == "proxyState" }.count == 2,
             "Unexpected proxy state event count"
         )

         #expect(
             isExpectedEvent(module.sentEvents[0], expected: ConduitEvent.proxyState(
                 ReactProxyState(
                     status: Conduit.ReactProxyState.Status.RUNNING,
                     networkState: nil
                 )
             )),
             "Expected proxy state event for starting status not found"
         )
         #expect(
             isExpectedEvent(module.sentEvents[1], expected: ConduitEvent.proxyState(
                 ReactProxyState(
                     status: Conduit.ReactProxyState.Status.RUNNING,
                     networkState: Conduit.ReactProxyState.NetworkState.HAS_INTERNET
                 )
             )),
             "Expected proxy state event for started status not found"
         )
         // End test consecutive toggles from stopped status
        
         try #require(await ensureStatus(.started), "Required conduit manager status not met")
         module.sentEvents.removeAll()

         // Test consecutive toggles from started status
         module.toggleInProxy(params, resolve: resolve, reject: reject)
         await withCheckedContinuation { continuation in
             self.testContinuation = continuation
             module.toggleInProxy(params, resolve: pendingResolve, reject: pendingReject)
         }

         #expect(self.pendingResolveVal == nil, "Unexpected resolve result from second toggle")

         try await Task.sleep(nanoseconds: 2000000000)  // ensure first toggle resolved
         #expect(resolveVal == nil, "Unexpected resolve result from first toggle")

         managerStatus = await module.conduitManager.conduitStatus
         #expect(managerStatus == .stopped, "Unexpected conduit manager status result from consecutive toggles")

         #expect(
             module.sentEvents.filter { $0.asDictionary["type"] as! String == "proxyState" }.count == 2,
             "Unexpected proxy state event count"
         )

         #expect(
             isExpectedEvent(module.sentEvents[0], expected: ConduitEvent.proxyState(
                 ReactProxyState(
                     status: Conduit.ReactProxyState.Status.STOPPED,
                     networkState: Conduit.ReactProxyState.NetworkState.HAS_INTERNET
                 )
             )),
             "Expected proxy state event for stopping status not found"
         )
         #expect(
             isExpectedEvent(module.sentEvents[1], expected: ConduitEvent.proxyState(
                 ReactProxyState(
                     status: Conduit.ReactProxyState.Status.STOPPED,
                     networkState: nil
                 )
             )),
             "Expected proxy state event for stopped status not found"
         )
         // End test consecutive toggles from started status
     }
    
     @Test("paramsChanged consecutive calls")
     func paramsChangedConsecutiveSuccess() async throws {

         let firstParams = NSDictionary(
             dictionary: [
                 "maxClients": 1,
                 "limitUpstreamBytesPerSecond": 1,
                 "limitDownstreamBytesPerSecond": 1,
                 "privateKey": "test_pk_1"
             ]
         )
         let secondParams = NSDictionary(
             dictionary: [
                 "maxClients": 1,
                 "limitUpstreamBytesPerSecond": 1,
                 "limitDownstreamBytesPerSecond": 1,
                 "privateKey": "test_pk_2"
             ]
         )

         try #require(await ensureStatus(.started), "Required conduit manager status not met")
         module.sentEvents.removeAll()

         // Test consecutive calls from started status
         module.paramsChanged(firstParams, resolve: resolve, reject: reject)
         await withCheckedContinuation { continuation in
             self.testContinuation = continuation
             module.toggleInProxy(secondParams, resolve: pendingResolve, reject: pendingReject)
         }

         #expect(self.pendingResolveVal == nil, "Unexpected resolve result from second call")

         var managerStatus = await module.conduitManager.conduitStatus
         #expect(managerStatus == .starting, "Unexpected conduit manager status from second call")

         try await Task.sleep(nanoseconds: 2000000000) // wait for first request
         #expect(resolveVal == nil, "Unexpected resolve result from first call")

         managerStatus = await module.conduitManager.conduitStatus
         #expect(managerStatus == .started, "Unexpected conduit manager status result from consecutive calls")

         #expect(
             module.sentEvents.filter { $0.asDictionary["type"] as! String == "proxyState" }.count == 2,
             "Unexpected proxy state event count"
         )

         #expect(
             isExpectedEvent(module.sentEvents[0], expected: ConduitEvent.proxyState(
                 ReactProxyState(
                     status: Conduit.ReactProxyState.Status.RUNNING,
                     networkState: Conduit.ReactProxyState.NetworkState.HAS_INTERNET
                 )
             )),
             "Expected event for starting status with uninterupted network state not found"
         )
         #expect(
             isExpectedEvent(module.sentEvents[1], expected: ConduitEvent.proxyState(
                 ReactProxyState(
                     status: Conduit.ReactProxyState.Status.RUNNING,
                     networkState: Conduit.ReactProxyState.NetworkState.HAS_INTERNET
                 )
             )),
             "Expected proxy state event for started status not found"
         )
         // End test consecutive calls from started status
     }
    
     @Test("sendFeedback with preparation failed")
     func sendFeedbackPreparationFailed() async throws{
         let inproxyId = "test_id"
        
         let getApplicationSupportDirectoryCopy = getApplicationSupportDirectory
         getApplicationSupportDirectory = {
             throw Err("Mocked Error")
         }
        
         await withCheckedContinuation { continuation in
             self.testContinuation = continuation
             module.sendFeedback(inproxyId, resolve: pendingResolve, reject: pendingReject)
         }
        
         #expect(pendingRejectVal.code == "error", "Expected reject code not found")
         #expect(pendingRejectVal.message == "Feedback preparation failed.", "Expected reject message not found")
        
         getApplicationSupportDirectory = getApplicationSupportDirectoryCopy
     }
    
     @Test("sendFeedback with upload failed")
     func sendFeedbackUploadFailed() async throws{
         let inproxyId = "test_id"
        
         let defaultPsiphonConfigCopy = defaultPsiphonConfig
         defaultPsiphonConfig = {
             var config = try readPsiphonConfig()
             config["DataRootDirectory"] = nil
             return config
         }
        
         await withCheckedContinuation { continuation in
             self.testContinuation = continuation
             module.sendFeedback(inproxyId, resolve: pendingResolve, reject: pendingReject)
         }
        
         #expect(pendingRejectVal.code == "error", "Expected reject code not found")
         #expect(pendingRejectVal.message == "Feedback upload failed.", "Expected reject message not found")
        
         defaultPsiphonConfig = defaultPsiphonConfigCopy
     }
    
     @Test("sendFeedback success")
     func sendFeedbackSuccess() async throws{
         let inproxyId = "test_id"
        
         await withCheckedContinuation { continuation in
             self.testContinuation = continuation
             module.sendFeedback(inproxyId, resolve: pendingResolve, reject: pendingReject)
         }
        
         #expect(pendingResolveVal == nil, "Unexpected resolve result from second toggle")
         #expect(pendingRejectVal.code == nil, "Unexpected reject code from second toggle")
         #expect(pendingRejectVal.message == nil, "Unexpected reject message from second toggle")
     }
}
