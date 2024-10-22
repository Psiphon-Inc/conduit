/*
 * Copyright (c) 2024, Psiphon Inc.
 * All rights reserved.
 */

import Foundation
import PsiphonTunnel

extension Logger {
    private static var subsystem = Bundle.main.bundleIdentifier!
    
    static let conduitMan = Logger(subsystem: subsystem, category: "ConduitManager")
    
    static let psiphonTunnel = Logger(subsystem: subsystem, category: "PsiphonTunnel")
}

struct ConduitParams: Equatable {
    let maxClients: Int
    let limitUpstream: Int
    let limitDownstream: Int
    let privateKey: String?
}

struct ActivityStats: Equatable {
    
    let startTime: TimeInterval
    private(set) var lastUpdate: TimeInterval
    private(set) var totalBytesUp: UInt64 = 0
    private(set) var totalBytesDown: UInt64 = 0
    private(set) var bytesUp: Int = 0
    private(set) var bytesDown: Int = 0
    private(set) var connectingClients: Int = 0
    private(set) var connectedClients: Int = 0
    
    /// Time elapsed since Conduit start in milliseconds.
    var elapsedTimeMilliseconds: UInt64 {
        UInt64((lastUpdate - startTime) / 1000)
    }
    
    init() {
        startTime = Date().timeIntervalSinceReferenceDate
        lastUpdate = startTime
    }
    
    mutating func update(
        bytesUp: Int, bytesDown: Int,
        connectingClients: Int, connectedClients: Int
    ) {
        self.lastUpdate = Date().timeIntervalSinceReferenceDate
        self.totalBytesUp += UInt64(bytesUp)
        self.totalBytesDown += UInt64(bytesDown)
        self.bytesUp = bytesUp
        self.bytesDown = bytesDown
        self.connectingClients = connectingClients
        self.connectedClients = connectedClients
    }
    
}

actor ConduitManager {
    
    protocol Listener {
        func onConduitStatusUpdate(
            _ status: ConduitManager.ConduitStatus,
            internetReachable: Bool?)
       
        func onInproxyProxyActivity(stats: ActivityStats)
    }
    
    enum ConduitStatus {
        case starting, started, stopping, stopped
    }
    
    // TODO: PsiphonTunnel doesn't hold a strong reference to the delegate object.
    private var psiphonTunnelListener: PsiphonTunnelListener?
    private var psiphonTunnel: PsiphonTunnelAsyncWrapper?
    
    private var listener: Listener
    
    private(set) var conduitStatus: ConduitStatus = .stopped
    private(set) var activityStats: ActivityStats? = .none
    
    init(listener: Listener) {
        self.listener = listener
    }

    private func setConduitStatus(_ status: ConduitStatus) {
        self.conduitStatus = status
        
        self.listener.onConduitStatusUpdate(
            status,
            internetReachable: self.psiphonTunnel!.isInternetReachable)
    }
    
    func startConduit(_ params: ConduitParams) async throws -> Bool {
        guard case .stopped = conduitStatus else {
            return false
        }
        
        if psiphonTunnel == nil {
            psiphonTunnelListener = PsiphonTunnelListener(listener: self)
            psiphonTunnel = PsiphonTunnelAsyncWrapper(
                tunneledAppDelegate: self.psiphonTunnelListener!)
        }
        
        let dynamicConfigs = PsiphonTunnelListener.DynamicConfigs(
            conduitParams: params,
            clientVersion: getClientVersion()
        )
        psiphonTunnelListener!.setConfigs(dynamicConfigs)
        
        setConduitStatus(.starting)
        
        let success = await psiphonTunnel!.start(forced: false)
        if success {
            setConduitStatus(.started)
            activityStats = ActivityStats()
            listener.onInproxyProxyActivity(stats: activityStats!)
        } else {
            setConduitStatus(.stopped)
        }
            
        return success
    }
    
    func stopConduit() async {
        guard
            let psiphonTunnel,
            case .started = conduitStatus else {
            return
        }
        setConduitStatus(.stopping)
        await psiphonTunnel.stop()
        setConduitStatus(.stopped)
        activityStats = .none
    }
    
    func updateActivityStats(
        connectingClients: Int, connectedClients: Int,
        bytesUp: Int, bytesDown: Int
    ) {
        
        guard var activityStats else {
            return
        }
        
        activityStats.update(
            bytesUp: bytesUp, bytesDown: bytesDown,
            connectingClients: connectingClients, connectedClients: connectedClients)
        
        self.listener.onInproxyProxyActivity(stats: activityStats)
    }
    
}

extension ConduitManager: PsiphonTunnelListener.Listener {
    
    nonisolated func onInternetReachabilityChanged(_ reachable: Bool) {
        Task {
            await self.listener.onConduitStatusUpdate(
                await self.conduitStatus,
                internetReachable: reachable)
        }
    }
    
    nonisolated func onInproxyProxyActivity(
        _ connectingClients: Int, connectedClients: Int,
        bytesUp: Int, bytesDown: Int
    ) {
        Task {
            await self.updateActivityStats(
                connectingClients: connectingClients, connectedClients: connectedClients,
                bytesUp: bytesUp, bytesDown: bytesDown)
        }
    }
    
}


fileprivate final class PsiphonTunnelAsyncWrapper {
    
    let psiphonTunnel: PsiphonTunnel
    
    var isInternetReachable: Bool? {
        var pointer = NetworkReachabilityNotReachable
        let networkReachability: NetworkReachability? = withUnsafeMutablePointer(to: &pointer) { pointer in
            let success = psiphonTunnel.getNetworkReachabilityStatus(pointer)
            if success {
                return pointer.pointee
            } else {
                return nil
            }
        }
        return networkReachability.map { $0 != NetworkReachabilityNotReachable }
    }
    
    init(tunneledAppDelegate: TunneledAppDelegate) {
        psiphonTunnel = PsiphonTunnel.newPsiphonTunnel(tunneledAppDelegate)
    }
    
    func start(forced: Bool) async -> Bool {
        // PsiphonTunnel start blocks.
        let task = Task.detached {
            return self.psiphonTunnel.start(forced)
        }
        return await task.value
    }
    
    func stop() async {
        let task = Task.detached {
            self.psiphonTunnel.stop()
        }
        await task.value
    }
    
}


fileprivate final class PsiphonTunnelListener: NSObject, TunneledAppDelegate {
    
    protocol Listener {
        func onInternetReachabilityChanged(_ reachable: Bool)
        func onInproxyProxyActivity(
            _ connectingClients: Int, connectedClients: Int,
            bytesUp: Int, bytesDown: Int)
    }
    
    struct DynamicConfigs {
        let conduitParams: ConduitParams
        let clientVersion: String
    }
    
    private let listener: Listener
    private var dynamicConfigs: DynamicConfigs?
    
    init(listener: Listener) {
        self.listener = listener
    }
    
    func setConfigs(_ configs: DynamicConfigs) {
        self.dynamicConfigs = configs
    }
    
    func getEmbeddedServerEntries() -> String? {
        do {
            let data = try Data(contentsOf: ResourceFile.embeddedServerEntries.url)
            return String(data: data, encoding: .utf8)
        } catch {
            Logger.conduitMan.fault("Failed to read embedded server entries")
            return nil
        }
    }
    
    func getPsiphonConfig() -> Any? {
        
        guard let dynamicConfigs else {
            fatalError()
        }
        
        do {
            var config: [String: Any?] = try defaultPsiphonConfig()
            
            config["UseNoticeFiles"] = [
                "RotatingFileSize": 1_000_000,
                "RotatingSyncFrequency": 0
            ]
            
            config["DisableLocalHTTPProxy"] = true
            config["DisableLocalSocksProxy"] = true
            config["EmitBytesTransferred"] = true
            config["ClientVersion"] = dynamicConfigs.clientVersion
            
            config["DisableTunnels"] = true
            config["InproxyEnableProxy"] = true
            
            // An ephemeral key will be generated if not set.
            if let privateKey = dynamicConfigs.conduitParams.privateKey {
                config["InproxyProxySessionPrivateKey"] = privateKey
            }
            
            config["InproxyMaxClients"] = dynamicConfigs.conduitParams.maxClients
            config["InproxyLimitUpstreamBytesPerSecond"] = dynamicConfigs.conduitParams.limitUpstream
            config["InproxyLimitDownstreamBytesPerSecond"] = dynamicConfigs.conduitParams.limitDownstream
            
            config["EmitInproxyProxyActivity"] = true
            
            return config
        } catch {
            Logger.conduitMan.error("getPsiphonConfig failed: \(error, privacy: .public)")
            return nil
        }
    }
    
    func onInproxyProxyActivity(
        _ connectingClients: Int32, connectedClients: Int32,
        bytesUp: Int, bytesDown: Int
    ) {
        listener.onInproxyProxyActivity(
            Int(connectedClients), connectedClients: Int(connectedClients),
            bytesUp: bytesUp, bytesDown: bytesDown)
    }
    
    func onInproxyMustUpgrade() {
    }
    
    func onStartedWaitingForNetworkConnectivity() {
        // onInternetReachabilityChanged doesn't get called on first start,
        // so we need to listen to onStartedWaitingForNetworkConnectivity as well.
        listener.onInternetReachabilityChanged(false)
    }
    
    func onInternetReachabilityChanged(_ currentReachability: NetworkReachability) {
        let reachable = currentReachability != NetworkReachabilityNotReachable
        listener.onInternetReachabilityChanged(reachable)
    }

    func onDiagnosticMessage(_ message: String, withTimestamp timestamp: String) {
        Logger.psiphonTunnel.debug("\(message, privacy: .public)")
    }
    
}
