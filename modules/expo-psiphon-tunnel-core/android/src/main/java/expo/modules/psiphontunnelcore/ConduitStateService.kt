/*
 * Copyright (c) 2026, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
package expo.modules.psiphontunnelcore

import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Binder
import android.os.Bundle
import android.os.DeadObjectException
import android.os.IBinder
import android.os.RemoteException
import ca.psiphon.conduit.nativemodule.IConduitClientCallback
import ca.psiphon.conduit.nativemodule.IConduitService
import ca.psiphon.conduit.state.IConduitStateCallback
import ca.psiphon.conduit.state.IConduitStateService
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

class ConduitStateService : Service() {
    companion object {
        private const val TAG = "ConduitStateService"
        private const val SCHEMA_VERSION = 1
        private const val BIND_ACTION = "ca.psiphon.conduit.ACTION_BIND_CONDUIT_STATE"
    }

    private enum class ProxyState {
        RUNNING,
        STOPPED,
        UNKNOWN,
    }

    private data class StateUpdate(
        val appVersion: Int,
        val state: ProxyState,
    ) {
        fun toJson(): String {
            val data = JSONObject().put("appVersion", appVersion)
            if (state != ProxyState.UNKNOWN) {
                data.put("running", state == ProxyState.RUNNING)
            }
            return JSONObject()
                .put("schema", SCHEMA_VERSION)
                .put("data", data)
                .toString()
        }
    }

    private val clients = ConcurrentHashMap<IBinder, IConduitStateCallback>()
    private val clientsLock = Any()
    private var inproxyService: IConduitService? = null
    private var isInproxyServiceBound = false
    private var isDestroyed = false
    @Volatile
    private var currentUpdate = StateUpdate(
        appVersion = -1,
        state = ProxyState.UNKNOWN,
    )

    private fun logInfo(message: String) {
        AppLogStore.info(applicationContext, TAG, message)
    }

    private fun logWarn(message: String) {
        AppLogStore.warn(applicationContext, TAG, message)
    }

    private fun logError(message: String, error: Throwable) {
        AppLogStore.error(applicationContext, TAG, message, error)
    }

    private val inproxyClientCallback = object : IConduitClientCallback.Stub() {
        override fun onProxyStateUpdated(proxyStateBundle: Bundle) {
            updateAndNotify(proxyStateFromBundle(proxyStateBundle))
        }

        override fun onProxyActivityStatsUpdated(proxyActivityStatsBundle: Bundle) {
            // The external state API only mirrors whether the proxy is running.
        }

        override fun onProxyError(proxyErrorBundle: Bundle) {
            // Errors are delivered to the app UI through ExpoPsiphonTunnelCoreModule.
        }
    }

    private val inproxyServiceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            logInfo("Connected to InproxyForegroundService")
            inproxyService = IConduitService.Stub.asInterface(service)
            try {
                inproxyService?.registerClient(inproxyClientCallback)
            } catch (error: RemoteException) {
                logError("Failed to register inproxy state callback", error)
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            logInfo("Disconnected from InproxyForegroundService")
            inproxyService = null
            isInproxyServiceBound = false
            if (!isDestroyed) {
                bindInproxyService()
            }
        }
    }

    private val binder = object : IConduitStateService.Stub() {
        override fun registerClient(client: IConduitStateCallback?) {
            if (client == null) {
                return
            }

            val caller = enforceTrustedCaller("registerClient")
            logInfo("Accepted registerClient from $caller")

            val clientBinder = client.asBinder()
            var activeClientCount = 0
            synchronized(clientsLock) {
                clients[clientBinder] = client
                activeClientCount = clients.size
            }
            val payload = currentUpdate.toJson()
            try {
                client.onStateUpdate(payload)
            } catch (e: RemoteException) {
                if (e is DeadObjectException) {
                    synchronized(clientsLock) {
                        clients.remove(clientBinder, client)
                        activeClientCount = clients.size
                    }
                } else {
                    logError("Failed to deliver initial state", e)
                }
            }
            emitIpcEvent(
                type = "registerClient",
                status = "accepted",
                caller = caller,
                activeClientCount = activeClientCount,
            )
        }

        override fun unregisterClient(client: IConduitStateCallback?) {
            if (client == null) {
                return
            }
            var activeClientCount = 0
            synchronized(clientsLock) {
                clients.remove(client.asBinder())
                activeClientCount = clients.size
            }
            logInfo("Accepted unregisterClient")
            emitIpcEvent(
                type = "unregisterClient",
                status = "accepted",
                activeClientCount = activeClientCount,
            )
        }

        override fun fetchConduitPrivateKey(): String {
            val caller = enforceTrustedCaller("fetchConduitPrivateKey")
            logInfo("Accepted fetchConduitPrivateKey from $caller")

            val privateKey = InproxyParameters.load(applicationContext)?.privateKey.orEmpty()
            if (privateKey.isBlank()) {
                emitIpcEvent(
                    type = "fetchConduitPrivateKey",
                    status = "failed",
                    caller = caller,
                    message = "Conduit private key is not set",
                )
                throw IllegalStateException("Conduit private key is not set")
            }
            emitIpcEvent(
                type = "fetchConduitPrivateKey",
                status = "accepted",
                caller = caller,
            )
            return privateKey
        }
    }

    override fun onCreate() {
        super.onCreate()
        isDestroyed = false

        val fileTrustedSignatures =
            PackageHelper.readTrustedSignaturesFromFile(applicationContext)
        val devTrustedSignatures =
            PackageHelper.parseTrustedSignaturesJson(
                BuildConfig.DEV_TRUSTED_SIGNATURES_JSON,
            )

        PackageHelper.configureRuntimeTrustedSignatures(
            PackageHelper.mergeTrustedSignatures(
                fileTrustedSignatures,
                devTrustedSignatures,
            ),
        )

        if (devTrustedSignatures.isNotEmpty()) {
            logWarn("Loaded development IPC signatures for ${devTrustedSignatures.size} package(s).")
        }

        currentUpdate = StateUpdate(
            appVersion = appVersionCode(),
            state = if (Utils.getServiceRunningFlag(applicationContext)) {
                ProxyState.RUNNING
            } else {
                ProxyState.STOPPED
            },
        )

        bindInproxyService()
    }

    override fun onDestroy() {
        super.onDestroy()
        isDestroyed = true
        unbindInproxyService()
        synchronized(clientsLock) {
            clients.clear()
        }
    }

    override fun onBind(intent: Intent?): IBinder? {
        if (intent?.action != BIND_ACTION) {
            logWarn("Denying bind with invalid action: ${intent?.action}")
            emitIpcEvent(
                type = "bind",
                status = "invalid",
                message = "Invalid bind action: ${intent?.action}",
            )
            return null
        }
        // The framework invokes onBind during service setup, so Binder.getCallingUid()
        // here does not reliably identify the eventual external client. Enforce caller
        // authorization on the AIDL methods instead, where the remote UID is correct.
        logInfo("Accepted bind for action $BIND_ACTION")
        emitIpcEvent(
            type = "bind",
            status = "accepted",
            message = "Bind action accepted; caller authorization is enforced per IPC method",
        )
        return binder
    }

    private fun updateAndNotify(state: ProxyState) {
        val update = StateUpdate(
            appVersion = appVersionCode(),
            state = state,
        )
        if (update == currentUpdate) {
            return
        }
        currentUpdate = update

        val payload = update.toJson()
        val callbacks = synchronized(clientsLock) {
            clients.entries.map { it.key to it.value }
        }
        val toRemove = mutableListOf<IBinder>()
        callbacks.forEach { (clientBinder, callback) ->
            try {
                callback.onStateUpdate(payload)
            } catch (error: RemoteException) {
                if (error is DeadObjectException) {
                    toRemove.add(clientBinder)
                } else {
                    logError("Failed to notify state client", error)
                }
            }
        }
        if (toRemove.isEmpty()) {
            return
        }
        val activeClientCount = synchronized(clientsLock) {
            callbacks.forEach { (clientBinder, callback) ->
                if (clientBinder in toRemove) {
                    clients.remove(clientBinder, callback)
                }
            }
            clients.size
        }
        emitIpcEvent(
            type = "stateClient",
            status = "disconnected",
            activeClientCount = activeClientCount,
            message = "Removed disconnected state client callback",
        )
    }

    private fun proxyStateFromBundle(eventData: Bundle): ProxyState {
        return when (eventData.getString("status")) {
            "RUNNING" -> ProxyState.RUNNING
            "STOPPED" -> ProxyState.STOPPED
            else -> ProxyState.UNKNOWN
        }
    }

    private fun bindInproxyService() {
        if (isInproxyServiceBound) {
            return
        }
        val intent = Intent(applicationContext, InproxyForegroundService::class.java)
        isInproxyServiceBound = bindService(intent, inproxyServiceConnection, Context.BIND_AUTO_CREATE)
        if (!isInproxyServiceBound) {
            logWarn("bindService returned false for InproxyForegroundService")
        }
    }

    private fun unbindInproxyService() {
        try {
            inproxyService?.unregisterClient(inproxyClientCallback)
        } catch (error: RemoteException) {
            logError("Failed to unregister inproxy state callback", error)
        }
        try {
            if (isInproxyServiceBound) {
                unbindService(inproxyServiceConnection)
            }
        } catch (_: IllegalArgumentException) {
        }
        inproxyService = null
        isInproxyServiceBound = false
    }

    private fun isTrustedUid(uid: Int): Boolean {
        return PackageHelper.verifyTrustedCallingUid(applicationContext, uid)
    }

    private fun enforceTrustedCaller(operation: String): String {
        val uid = Binder.getCallingUid()
        val caller = PackageHelper.describeCallingUid(applicationContext, uid)
        if (!isTrustedUid(uid)) {
            logDeniedCaller(operation, caller)
            throw SecurityException("Client is not authorized: $operation")
        }
        return caller
    }

    private fun logDeniedCaller(operation: String, caller: String) {
        logWarn("Denied $operation from $caller")
        emitIpcEvent(
            type = operation,
            status = "denied",
            caller = caller,
            message = "Client is not authorized",
        )
    }

    private fun emitIpcEvent(
        type: String,
        status: String,
        caller: String? = null,
        activeClientCount: Int? = null,
        message: String? = null,
    ) {
        val data = Bundle().apply {
            putString("status", status)
            putLong("timestampMs", System.currentTimeMillis())
            if (!caller.isNullOrBlank()) {
                putString("caller", caller)
            }
            if (activeClientCount != null) {
                putInt("activeClientCount", activeClientCount)
            }
            if (!message.isNullOrBlank()) {
                putString("message", message)
            }
        }
        IpcEventQueue.enqueue(type, data)
    }

    private fun appVersionCode(): Int {
        return try {
            val packageInfo = packageManager.getPackageInfo(packageName, 0)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode
            }
        } catch (e: Exception) {
            logError("Failed to fetch app version code", e)
            -1
        }
    }
}
