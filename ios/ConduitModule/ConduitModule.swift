/*
 * Copyright (c) 2024, Psiphon Inc.
 * All rights reserved.
 */

import Foundation
import PsiphonTunnel
import OSLog


extension Logger {
    private static var subsystem = Bundle.main.bundleIdentifier!
    
    static let conduitModule = Logger(subsystem: subsystem, category: "ConduitModule")
}

/// A type that is used for cross-langauge interaction with JavaScript codebase.
protocol ReactNativeEncodable: Encodable {
    var asDictionary: [String: Any?] { get }
}

/// A type that is sent as an event back to JavaScript via the bridge.
protocol ReactNativeEvent: ReactNativeEncodable {
    static var eventName: String { get }
}

struct ReactProxyState: Codable {
    
    enum Status: String, Codable {
        case RUNNING, STOPPED, UNKNOWN
    }
    
    enum NetworkState: String, Codable {
        case HAS_INTERNET, NO_INTERNET
    }
    
    let status: Status
    let networkState: NetworkState?
    
}

extension ReactProxyState: ReactNativeEncodable {
    var asDictionary: [String : Any?] {
        [
            "status": status.rawValue,
            "networkState": networkState?.rawValue
        ]
    }
}

enum ReactProxyError: Error, Codable {
    case proxyStartFailed
    case proxyRestartFailed
    case inProxyMustUpgrade
}

extension ReactProxyError: ReactNativeEncodable {
    var asDictionary: [String : Any?] {
        let action: String = switch self {
        case .proxyStartFailed: "proxyStartFailed"
        case .proxyRestartFailed: "proxyRestartFailed"
        case .inProxyMustUpgrade: "inProxyMustUpgrade"
        }
        return [
            "action": action
        ]
    }
}

struct ReactInProxyActivityStats: Codable {
    
    struct Period: Codable {
        var bytesUp: [Int]
        var bytesDown: [Int]
        var connectingClients: [Int]
        var connectedClients: [Int]
        
        init() {
            bytesUp = .init(repeating: 0, count: 288)
            bytesDown = .init(repeating: 0, count: 288)
            connectingClients = .init(repeating: 0, count: 288)
            connectedClients = .init(repeating: 0, count: 288)
        }
        
    }
    
    /// Total elapsed time in milliseconds.
    let elapsedTime: UInt64
    
    /// Cumulative bytes uploaded.
    let totalBytesUp: UInt64
    
    /// Cumulative bytes downloaded.
    let totalBytesDown: UInt64
    
    /// Number of connecting clients.
    let currentConnectingClients: Int
    
    /// Number of connected clients.
    let currentConnectedClients: Int
    
    let dataByPeriod: [String: Period]
}

extension ReactInProxyActivityStats: ReactNativeEncodable {
    var asDictionary: [String : Any?] {
        [
            "elapsedTime": elapsedTime,
            "totalBytesUp": totalBytesUp,
            "totalBytesDown": totalBytesDown,
            "currentConnectingClients": currentConnectingClients,
            "currentConnectedClients": currentConnectedClients,
            "dataByPeriod": dataByPeriod.mapValues { $0.asDictionary },
        ]
    }
}

extension ReactInProxyActivityStats.Period: ReactNativeEncodable {
    var asDictionary: [String : Any?] {
        [
            "bytesUp": bytesUp,
            "bytesDown": bytesDown,
            "connectingClients": connectingClients,
            "connectedClients": connectedClients
        ]
    }
}

/// PsiphonVPNEvent represents the events sent back to JavaScript via the bridge.
enum ConduitEvent {
    case proxyState(ReactProxyState)
    case proxyError(ReactProxyError)
    case inProxyActivityStats(ReactInProxyActivityStats)
}

extension ConduitEvent: ReactNativeEvent {
    
    static var eventName: String {
        "ConduitEvent"
    }
    
    var asDictionary: [String: Any?] {
        switch self {
        case let .proxyState(proxyState):
            ["type": "proxyState", "data": proxyState.asDictionary]
        case let .proxyError(proxyError):
            ["type": "proxyError", "data": proxyError.asDictionary]
        case let .inProxyActivityStats(stats):
            ["type": "inProxyActivityStats", "data": stats.asDictionary]
        }
    }
    
}


// MARK: - ConduitModule

/// React Native module for managing the VPN.
@objc(ConduitModule)
final class ConduitModule: RCTEventEmitter {
    
    // Concurrency note:
    // Exported methods of this class (defined in ConduitModule.mm) are
    // called on the provided dispatch queue (methodQueue).
    // Hence all members of this class should be considered as being owned
    // by the given dispatch queue.
    
    var conduitManager: ConduitManager!
    
    var hasListeners: Bool = false
    
    // Dispatch queue used by React Native to call exported methods (after initialization).
    // This queue is not expected to be under contention, so use `.sync` to submit block for
    // synchronous execution to reuse the same thread.
    // Note that using `.sync` and targeting the same queue will result in a deadlock.
    let dispatchQueue: dispatch_queue_t
    
    let psiphonInfo: PsiphonInfo
    
    override init() {
        dispatchQueue = DispatchQueue(label: "ca.psiphon.ryve.psiphonVpnModule", qos: .default)
        self.psiphonInfo = try! readPsiphonInfo()
        super.init()
        
        conduitManager = ConduitManager(listener: self)
    }
    
    override var methodQueue: dispatch_queue_t! {
        return dispatchQueue
    }
    
    override func startObserving() {
        hasListeners = true
        Task {
            let status = await self.conduitManager.conduitStatus
            
            // Send first status update.
            self.onConduitStatusUpdate(status, internetReachable: true)
        }
    }
    
    override func stopObserving() {
        hasListeners = false
    }
    
    override func supportedEvents() -> [String]! {
        return [ConduitEvent.eventName]
    }
    
    func sendEvent(_ event: ConduitEvent) {
        sendEvent(withName: ConduitEvent.eventName, body: event.asDictionary)
        Logger.conduitModule.debug("ConduitEvent: \(String(describing: event))")
    }
    
}

// Exported native methods
extension ConduitModule {
    
    @objc(toggleInProxy:limitUpstream:limitDownstream:privateKey:withResolver:withRejecter:)
    func toggleInProxy(
        _ maxClients: Int, limitUpstream: Int, limitDownsteram: Int, privateKey: String?,
        resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    ) {
        Task {
            switch await self.conduitManager.conduitStatus {
            case .stopped:
                let params = ConduitParams(
                    maxClients: maxClients,
                    limitUpstream: limitUpstream,
                    limitDownstream: limitDownsteram,
                    privateKey: privateKey
                )
                do {
                    let success = try await self.conduitManager.startConduit(params)
                    if !success {
                        sendEvent(.proxyError(.proxyStartFailed))
                    }
                } catch {
                    sendEvent(.proxyError(.proxyStartFailed))
                    Logger.conduitModule.error(
                        "Proxy start failed: \(String(describing: error), privacy: .public)")
                }
            case .started:
                await self.conduitManager.stopConduit()
            case .starting, .stopping:
                // no-op
                break
            }
            resolve(nil)
        }
    }
    
    @objc(paramsChanged:limitUpstream:limitDownstream:privateKey:withResolver:withRejecter:)
    func paramsChanged(
        _ maxClients: Int, limitUpstream: Int, limitDownsteram: Int, privateKey: String?,
        resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    ) {
        Task {
            switch await self.conduitManager.conduitStatus {
            case .stopping, .stopped:
                // no-op
                resolve(nil)
                
            case .starting:
                reject("error", "Cannot change parameters while Conduit is starting.", nil)
                return
                
            case .started:
                let params = ConduitParams(
                    maxClients: maxClients,
                    limitUpstream: limitUpstream,
                    limitDownstream: limitDownsteram,
                    privateKey: privateKey
                )
                do {
                    let success = try await self.conduitManager.startConduit(params)
                    if !success {
                        sendEvent(.proxyError(.proxyRestartFailed))
                    }
                    resolve(nil)
                } catch {
                    sendEvent(.proxyError(.proxyRestartFailed))
                }
            }
        }
    }
    
    @objc(sendFeedback:withRejecter:)
    func sendFeedback(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        
        do {
            // Read psiphon-tunnel-core notices.
            
            let dataRootDirectory = try getApplicationSupportDirectory()
            
            let tunnelCoreNoticesPath: [URL] = [
                // Return values are tagged _Nullable, but should never be nil.
                noticesFilePath(dataRootDirectory: dataRootDirectory),
                olderNoticesFilePath(dataRootDirectory: dataRootDirectory)
            ]
            
            let (tunnelCoreEntries, parseErrors) = try readDiagnosticLogFiles(
                TunnelCoreLog.self,
                paths: tunnelCoreNoticesPath,
                transform: DiagnosticEntry.create(from:))
            
            if parseErrors.count > 0 {
                Logger.conduitModule.error(
                    "Log parse errors: \(String(describing: parseErrors), privacy: .public)")
            }
            
            
            // Prepare Feedback Diagnostic Report
            
            let feedbackId = try generateFeedbackId()
            
            let report = FeedbackDiagnosticReport(
                metadata: Metadata(
                    id: feedbackId,
                    appName: "conduit",
                    platform: ClientPlatform.platformString,
                    date: Date()),
                feedback: nil,
                diagnosticInfo: DiagnosticInfo(
                    systemInformation: SystemInformation(
                        build: DeviceInfo.gatherDeviceInfo(device: .current),
                        tunnelCoreBuildInfo: PsiphonTunnel.getBuildInfo(),
                        psiphonInfo: self.psiphonInfo,
                        isAppStoreBuild: true,
                        isJailbroken: false,
                        language: getLanguageMinimalIdentifier(),
                        // TODO: get networkTypeName
                        networkTypeName: "WIFI"),
                    diagnosticHistory: tunnelCoreEntries
                ))
            
            let json = String(data: try JSONEncoder().encode(report), encoding: .utf8)!
            
            // Upload diagnostic report.
            
            Task {
                do {
                    try await FeedbackUploadService.live.startUpload(
                        data: json,
                        psiphonConfig: defaultPsiphonConfig(),
                        uploadPath: "")
                    
                    resolve(nil)
                    Logger.conduitModule.info("Finished uploading feedback diagnostic report.")
                } catch {
                    reject("error", "Feedback upload failed", nil)
                    Logger.conduitModule.error(
                        "Feedback upload failed: \(String(describing: error), privacy: .public)")
                }
            }
            
        } catch {
            reject("error", "Feedback upload failed", nil)
            Logger.conduitModule.error(
                "Feedback upload failed: \(String(describing: error), privacy: .public)")
        }
    }
    
}


extension ConduitModule: ConduitManager.Listener {
    
    func onConduitStatusUpdate(_ status: ConduitManager.ConduitStatus,
                               internetReachable: Bool?) {
        
        let proxyStatus: ReactProxyState.Status = switch status {
        case .starting, .started: .RUNNING
        case .stopping, .stopped: .STOPPED
        }
        
        let networkState: ReactProxyState.NetworkState? = switch internetReachable {
        case .none: .none
        case .some(true): .HAS_INTERNET
        case .some(false): .NO_INTERNET
        }
        
        let proxyState = ReactProxyState(
            status: proxyStatus,
            networkState: networkState)
        
        sendEvent(.proxyState(proxyState))
    }
    
    func onInproxyProxyActivity(stats: ActivityStats) {
        sendEvent(
            .inProxyActivityStats(
                ReactInProxyActivityStats(
                    elapsedTime: stats.elapsedTimeMilliseconds,
                    totalBytesUp: stats.totalBytesUp,
                    totalBytesDown: stats.totalBytesDown,
                    currentConnectingClients: stats.connectingClients,
                    currentConnectedClients: stats.connectedClients,
                    dataByPeriod: ["1000ms": .init()])))
    }
    
}

func readPsiphonInfo() throws -> PsiphonInfo {
    let config = try readPsiphonConfig()
    
    guard let propagationChannelId = config["PropagationChannelId"] as? String else {
        throw Err("psiphon config is missing PropagationChannelId")
    }
    guard let sponsorId = config["SponsorId"] as? String else {
        throw Err("psiphon config is missing SponsorId")
    }
    
    return PsiphonInfo(
        clientVersion: getClientVersion(),
        propagationChannelId: propagationChannelId,
        sponsorId: sponsorId
    )
}
