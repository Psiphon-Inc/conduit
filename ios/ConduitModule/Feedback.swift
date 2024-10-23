/*
 * Copyright (c) 2024, Psiphon Inc.
 * All rights reserved.
 */


import Foundation

// MARK: - Feedback types

public struct Metadata : Codable {
    
    /// Feedback version type.
    let version: Int = 1
    
    /// Feedback ID.
    let id: String
    
    /// Client platform.
    let platform: String
    
    /// App name.
    let appName: String
    
    @ISO1806MilliCodedDate var date: Date
    
    init(id: String, appName: String, platform: String, date: Date) {
        self.id = id
        self.appName = appName
        self.platform = platform
        self.date = date
    }
    
    enum CodingKeys : String, CodingKey {
        case version = "version"
        case id = "id"
        case platform = "platform"
        case appName = "appName"
        case date = "date!!timestamp"
    }
    
}

public struct PsiphonInfo : Codable {
    
    let clientVersion: String?
    let propagationChannelId: String?
    let sponsorId: String?
    let inproxyId: String?
    
    enum CodingKeys : String, CodingKey {
        case clientVersion = "CLIENT_VERSION"
        case propagationChannelId = "PROPAGATION_CHANNEL_ID"
        case sponsorId = "SPONSOR_ID"
        case inproxyId = "INPROXY_ID"
    }
    
}

public struct SystemInformation : Codable {
    
    let build: DeviceInfo
    let tunnelCoreBuildInfo: String
    let psiphonInfo: PsiphonInfo
    let isAppStoreBuild: Bool
    let isJailbroken: Bool
    
    /// BCP-47 identifier in a minimalist form. Script and region may be omitted. For example, "zh-TW", "en"
    let language: String
    
    let networkTypeName: String
    
    enum CodingKeys : String, CodingKey {
        case build = "Build"
        case tunnelCoreBuildInfo = "buildInfo"
        case psiphonInfo = "PsiphonInfo"
        case isAppStoreBuild = "isAppStoreBuild"
        case isJailbroken = "isJailbroken"
        case language = "language"
        case networkTypeName = "networkTypeName"
    }
    
}

public struct DiagnosticEntry : Codable {
    
    let message: String
    let data: GenericJSON
    @ISO1806MilliCodedDate var timestamp: Date

    enum CodingKeys : String, CodingKey {
        case message = "msg"
        case data = "data"
        case timestamp = "timestamp!!timestamp"
    }
    
    init(message: String, data: GenericJSON = .object([:]), timestamp: Date) {
        self.message = message
        self.data = data
        self.timestamp = timestamp
    }
    
}

public struct DiagnosticInfo : Codable {
    
    let systemInformation: SystemInformation
    let diagnosticHistory: [DiagnosticEntry]
    
    // TODO: This field is not used but is required to exist to maintain
    // compatibility with the feedback server, preventing formatting errors.
    private let statusHistory: [String] = []
    
    enum CodingKeys : String, CodingKey {
        case systemInformation = "SystemInformation"
        case statusHistory = "StatusHistory"
        case diagnosticHistory = "DiagnosticHistory"
    }
    
}

public struct SurveyResponse : Codable {
    
    let title: String
    let question: String
    let answer: Int
    
    public static func overallSatisfaction(thumbsUp: Bool?) -> SurveyResponse {
        
        let answer = switch thumbsUp {
        case .none: -1 // Default unselected
        case .some(true): 0  // Thumbs up
        case .some(false): 1  // Thumbs down
        }
        
        return .init(
            title: "Overall satisfaction",
            question: "24f5c290039e5b0a2fd17bfcdb8d3108",
            answer: answer)
    }
    
}

public struct FeedbackMessage : Codable {
    let text: String
}

public struct Feedback : Codable {
    
    let email: String
    let message: FeedbackMessage
    let survey: [SurveyResponse]
    
    enum CodingKeys : String, CodingKey {
        case email = "email"
        case message = "Message"
        case survey = "Survey"
    }
    
    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        
        try container.encode(email, forKey: .email)
        
        // Encode message as a nested dictionary with "text"
        try container.encode(message, forKey: .message)
        
        // Encode survey as a JSON string
        let surveyData = try JSONEncoder().encode(survey)
        let surveyJSONString = String(data: surveyData, encoding: .utf8) ?? "[]"
        try container.encode(["json": surveyJSONString], forKey: .survey)
    }
    
}

public struct DeviceInfo : Codable {
    
    let systemName: String
    let systemVersion: String
    let model: String
    let localizedModel: String
    let userInterfaceIdiom: String
    
    static func gatherDeviceInfo(device: UIDevice) -> DeviceInfo {
        let userInterfaceIdiom = switch device.userInterfaceIdiom {
        case .unspecified: "unspecified"
        case .phone: "phone"
        case .pad: "pad"
        case .tv: "tv"
        case .carPlay: "carPlay"
        case .mac: "mac"
        case .vision: "vision"
        @unknown default: "unknown"
        }
        
        return .init(
            systemName: device.systemName,
            systemVersion: device.systemVersion,
            model: device.model,
            localizedModel: device.localizedModel,
            userInterfaceIdiom: userInterfaceIdiom
        )
    }
}

public struct FeedbackDiagnosticReport : Codable {
    
    let metadata: Metadata
    let feedback: Feedback?
    let diagnosticInfo: DiagnosticInfo
    
    enum CodingKeys : String, CodingKey {
        case metadata = "Metadata"
        case feedback = "Feedback"
        case diagnosticInfo = "DiagnosticInfo"
    }
}

public enum ClientPlatform {
    
    static var platformString: String {
        var clientPlatform = "ios"
        if #available(iOS 14.0, *) {
            if ProcessInfo().isiOSAppOnMac {
                clientPlatform = "ios-app-on-mac"
            }
        }
        return clientPlatform
    }
    
}

func generateRandomBytes(count: Int) -> [UInt8]? {
    var randomBytes = [UInt8](repeating: 0, count: count)
    let result = SecRandomCopyBytes(kSecRandomDefault, count, &randomBytes)
    if result != errSecSuccess {
        return nil
    }
    return randomBytes
}

func generateFeedbackId() throws -> String {
    let numBytes = 8
    guard let randomBytes = generateRandomBytes(count: numBytes) else {
        throw Err("Failed to generate random bytes")
    }
    // Convert the random bytes into a hex string
    let feedbackID = randomBytes.map { String(format: "%02hhX", $0) }.joined()
    return feedbackID
}

// MARK: -

// The section below is too platform dependent,
// needs to manage all the signals for when to upload / do the work.

public struct Err : Error, CustomStringConvertible {
    private let message: String
    
    init(_ message: String) {
        self.message = message
    }
    
    public var description: String {
        return message
    }
    
    public var asString: String {
        return message
    }
    
}

// MARK: - Parse tunnel-core logs

public struct TunnelCoreLog : Codable {
    let noticeType: String
    let data: GenericJSON
    @ISO1806MilliCodedDate var timestamp: Date
}

public extension DiagnosticEntry {
    
    static func create(from tunnelCoreLog: TunnelCoreLog) throws -> DiagnosticEntry {
        DiagnosticEntry(
            message: "",
            data: try GenericJSON(
                ["noticeType": tunnelCoreLog.noticeType,
                 "data": tunnelCoreLog.data,
                ]),
            timestamp: tunnelCoreLog.timestamp
        )
    }
    
}

#if canImport(PsiphonTunnel)
import PsiphonTunnel

/// Validates fields required for a feedback upload operation to the default Psiphon config.
func validatePsiphonConfig(_ config: [String: Any?]) throws {
    guard config["EnableFeedbackUpload"] as? Bool == true else {
        throw Err("Expected EnableFeedbackUpload to be true.")
    }
    guard config["feedbackConfig"] != nil else {
        throw Err("Expected feedbackConfig to be present.")
    }
    guard config["FeedbackUploadURLs"] != nil else {
        throw Err("Expected FeedbackUploadURLs to be present.")
    }
    guard config["FeedbackEncryptionPublicKey"] != nil else {
        throw Err("Expected FeedbackEncryptionPublicKey to be present.")
    }
    guard config["DataRootDirectory"] != nil else {
        throw Err("Expected DataRootDirectory in Psiphon config.")
    }
}

public actor FeedbackUploadService : NSObject {
    
    public protocol Listener {
        func onDiagnosticMessage(_ message: String, withTimestamp timestamp: String)
    }
    
    public enum Errors : Error {
        case feedbackUploadCancelled
    }
    
    static let live = FeedbackUploadService()
    
    private(set) var listener: Listener?
    
    private let psiphonTunnelFeedback: PsiphonTunnelFeedback
    private var sendContinuation: CheckedContinuation<(), Error>?
    
    private override init() {
        self.psiphonTunnelFeedback = PsiphonTunnelFeedback()
        self.sendContinuation = nil
        super.init()
    }
    
    public func setListener(_ listener: Listener) {
        self.listener = listener
    }
    
    /// - throws: type `FeedbackUpload.Errors`
    public func startUpload(
        data: String,
        psiphonConfig: [String: Any?],
        uploadPath: String) async throws {
            
        try validatePsiphonConfig(psiphonConfig)
        
        // Cancel any ongoing feedback uploads.
        if let sendContinuation {
            // stopSend is synchronous and returns once the upload has been cancelled.
            self.psiphonTunnelFeedback.stopSend()
            sendContinuation.resume(throwing: Errors.feedbackUploadCancelled)
            self.sendContinuation = nil
        }
        
        return try await withCheckedThrowingContinuation { continuation in
            // Note: this closure is called synchronously on the calling taks.
            self.sendContinuation = continuation
            
            // startSend is asynchronous and returns before the upload completes.
            self.psiphonTunnelFeedback.startSend(
                data,
                feedbackConfigJson: psiphonConfig,
                uploadPath: uploadPath,
                loggerDelegate: self,
                feedbackDelegate: self)
        }
        
    }
    
    public func stopUpload() {
        // stopSend is synchronous and returns once the upload has been cancelled.
        self.psiphonTunnelFeedback.stopSend()
        self.sendContinuation?.resume(throwing: Errors.feedbackUploadCancelled)
        self.sendContinuation = nil
    }
    
    private func feedbackUploadDidFinish(err: Error?) {
        if let err {
            self.sendContinuation?.resume(throwing: err)
        } else {
            self.sendContinuation?.resume(returning: ())
        }
        self.sendContinuation = nil
    }
    
}

extension FeedbackUploadService : PsiphonTunnelLoggerDelegate, PsiphonTunnelFeedbackDelegate {
    
    public nonisolated func onDiagnosticMessage(_ message: String, withTimestamp timestamp: String) {
        Task {
            await self.listener?.onDiagnosticMessage(message, withTimestamp: timestamp)
        }
    }
    
    public nonisolated func sendFeedbackCompleted(_ err: (any Error)?) {
        Task {
            await self.feedbackUploadDidFinish(err: err)
        }
    }
    
}

#endif

// MARK: - Basic type

@propertyWrapper
public struct ISO1806MilliCodedDate : Equatable {
    
    // Date.ISO8601FormatStyle type is Sendable, and therefore thread-safe.
    private static let formatter = Date.ISO8601FormatStyle()
        .year().month().day()
        .timeZone(separator: .colon)
        .time(includingFractionalSeconds: true)
        .dateSeparator(.dash)
        .timeSeparator(.colon)
    
    public init(wrappedValue: Date) {
        self.wrappedValue = wrappedValue
    }
    
    public var wrappedValue: Date
}

extension ISO1806MilliCodedDate : Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let dateString = try container.decode(String.self)
        wrappedValue = try Self.formatter.parse(dateString)
    }
    
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(Self.formatter.format(wrappedValue))
    }
}

/// A simple typed JSON data structure, enabling arbitrary JSON to be Codable.
public enum GenericJSON : Codable, Equatable {
    
    enum Errors : Error {
        case invalidType(String)
    }
    
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case list([GenericJSON])
    case object([String : GenericJSON])
    
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        
        if container.decodeNil() {
            self = .null
        } else {
            do {
                self = .bool(try container.decode(Bool.self))
            } catch DecodingError.typeMismatch {
                do {
                    self = .int(try container.decode(Int.self))
                } catch {
                    // TODO: Find a better way than catching all errors for int decoding
                    do {
                        self = .double(try container.decode(Double.self))
                    } catch DecodingError.typeMismatch {
                        do {
                            self = .string(try container.decode(String.self))
                        } catch DecodingError.typeMismatch {
                            do {
                                self = .list(try container.decode([GenericJSON].self))
                            } catch DecodingError.typeMismatch {
                                self = .object(try container.decode([String : GenericJSON].self))
                            }
                        }
                    }
                }
            }
        }
    }
    
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let bool): try container.encode(bool)
        case .int(let int): try container.encode(int)
        case .double(let double): try container.encode(double)
        case .string(let string): try container.encode(string)
        case .list(let list): try container.encode(list)
        case .object(let dictionary): try container.encode(dictionary)
        }
    }
    
}

extension GenericJSON {
    
    /// Create a JSON value from anything.
    ///
    /// Argument has to be a valid JSON structure: A `Double`, `Int`, `String`,
    /// `Bool`, an `Array` of those types or a `Dictionary` of those types.
    public init(_ value: Any?) throws {
        switch value {
        case .none:
            self = .null
        case .some(let value):
            switch value {
            case let bool as Bool:
                self = .bool(bool)
            case let int as Int:
                self = .int(int)
            case let double as Double:
                self = .double(double)
            case let str as String:
                self = .string(str)
            case let array as [Any?]:
                self = .list(try array.map(GenericJSON.init))
            case let dict as [String: Any?]:
                self = .object(try dict.mapValues(GenericJSON.init))
            case let json as GenericJSON:
                self = json
            default:
                throw Errors.invalidType(
                    "Failed to create GenericJSON type from type: \(String(describing: type(of: value)))")
            }
        }
    }
}
