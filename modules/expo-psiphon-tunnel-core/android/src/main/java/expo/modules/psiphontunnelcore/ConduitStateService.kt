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
import android.util.Log
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
    private var currentUpdate = StateUpdate(
        appVersion = -1,
        state = ProxyState.UNKNOWN,
    )

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
            Log.i(TAG, "Connected to InproxyForegroundService")
            inproxyService = IConduitService.Stub.asInterface(service)
            try {
                inproxyService?.registerClient(inproxyClientCallback)
            } catch (error: RemoteException) {
                Log.e(TAG, "Failed to register inproxy state callback", error)
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.i(TAG, "Disconnected from InproxyForegroundService")
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
            Log.i(
                TAG,
                "Accepted registerClient from $caller",
            )

            var activeClientCount = 0
            synchronized(clientsLock) {
                val clientBinder = client.asBinder()
                clients[clientBinder] = client
                activeClientCount = clients.size
                try {
                    client.onStateUpdate(currentUpdate.toJson())
                } catch (e: RemoteException) {
                    Log.e(TAG, "Failed to deliver initial state", e)
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
            Log.i(TAG, "Accepted unregisterClient")
            emitIpcEvent(
                type = "unregisterClient",
                status = "accepted",
                activeClientCount = activeClientCount,
            )
        }

        override fun fetchConduitPrivateKey(): String {
            val caller = enforceTrustedCaller("fetchConduitPrivateKey")
            Log.i(
                TAG,
                "Accepted fetchConduitPrivateKey from $caller",
            )

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
            Log.w(
                TAG,
                "Loaded development IPC signatures for ${devTrustedSignatures.size} package(s).",
            )
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
            Log.w(TAG, "Denying bind with invalid action: ${intent?.action}")
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
        Log.i(TAG, "Accepted bind for action $BIND_ACTION")
        emitIpcEvent(
            type = "bind",
            status = "accepted",
            message = "Bind action accepted; caller authorization is enforced per IPC method",
        )
        return binder
    }

    private fun updateAndNotify(state: ProxyState) {
        currentUpdate = StateUpdate(
            appVersion = appVersionCode(),
            state = state,
        )

        val payload = currentUpdate.toJson()
        synchronized(clientsLock) {
            val toRemove = mutableListOf<IBinder>()
            clients.forEach { (clientBinder, callback) ->
                try {
                    callback.onStateUpdate(payload)
                } catch (error: RemoteException) {
                    if (error is DeadObjectException) {
                        toRemove.add(clientBinder)
                    } else {
                        Log.e(TAG, "Failed to notify state client", error)
                    }
                }
            }
            toRemove.forEach { clients.remove(it) }
            if (toRemove.isNotEmpty()) {
                emitIpcEvent(
                    type = "stateClient",
                    status = "disconnected",
                    activeClientCount = clients.size,
                    message = "Removed disconnected state client callback",
                )
            }
        }
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
            Log.w(TAG, "bindService returned false for InproxyForegroundService")
        }
    }

    private fun unbindInproxyService() {
        try {
            inproxyService?.unregisterClient(inproxyClientCallback)
        } catch (error: RemoteException) {
            Log.e(TAG, "Failed to unregister inproxy state callback", error)
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
        Log.w(
            TAG,
            "Denied $operation from $caller",
        )
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
            Log.e(TAG, "Failed to fetch app version code", e)
            -1
        }
    }
}
