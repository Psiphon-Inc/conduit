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

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.ServiceConnection
import android.os.Bundle
import android.os.IBinder
import android.os.RemoteException
import androidx.core.content.ContextCompat
import ca.psiphon.conduit.nativemodule.IConduitClientCallback
import ca.psiphon.conduit.nativemodule.IConduitService

class ConduitServiceInteractor(private val context: Context) {
    companion object {
        private const val TAG = "ConduitServiceInteractor"
    }

    private var isStopped = true
    private var isServiceBound = false
    private var isReceiverRegistered = false
    private var conduitService: IConduitService? = null
    private var callback: ((String, Bundle) -> Unit)? = null

    private val serviceStartingReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != InproxyForegroundService.SERVICE_STARTING_BROADCAST_INTENT) {
                return
            }
            if (isStopped) {
                return
            }
            logInfo("Received service starting broadcast; binding to InproxyForegroundService")
            bindService()
            registerClientIfReady("service starting broadcast")
        }
    }

    private fun logInfo(message: String) {
        AppLogStore.info(context, TAG, message)
    }

    private fun logWarn(message: String) {
        AppLogStore.warn(context, TAG, message)
    }

    private fun logError(message: String, error: Throwable) {
        AppLogStore.error(context, TAG, message, error)
    }

    private val clientCallback = object : IConduitClientCallback.Stub() {
        override fun onProxyStateUpdated(proxyStateBundle: Bundle) {
            logInfo("Received proxy state callback: ${proxyStateBundle.getString("status")}")
            callback?.invoke("proxyState", proxyStateBundle)
        }

        override fun onProxyActivityStatsUpdated(proxyActivityStatsBundle: Bundle) {
            callback?.invoke("inProxyActivityStats", proxyActivityStatsBundle)
        }

        override fun onProxyError(proxyErrorBundle: Bundle) {
            callback?.invoke("proxyError", proxyErrorBundle)
        }
    }

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            logInfo("Connected to InproxyForegroundService")
            conduitService = IConduitService.Stub.asInterface(service)
            registerClientIfReady("service connected")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            logInfo("Disconnected from InproxyForegroundService")
            conduitService = null
            isServiceBound = false

            if (isStopped) {
                return
            }

            bindService()
        }
    }

    fun onStart(callback: (String, Bundle) -> Unit) {
        this.callback = callback
        isStopped = false
        logInfo("Interactor start")
        registerServiceStartingReceiver()
        bindService()
        registerClientIfReady("observer start")
    }

    fun onStop() {
        isStopped = true
        logInfo("Interactor stop")
        try {
            conduitService?.unregisterClient(clientCallback)
        } catch (error: RemoteException) {
            logError("Failed to unregister inproxy client", error)
        }

        if (isServiceBound) {
            context.unbindService(serviceConnection)
            isServiceBound = false
        }
        conduitService = null
        callback = null
    }

    fun requestCurrentState() {
        bindService()
        registerClientIfReady("current state requested")
    }

    fun onDestroy() {
        if (!isStopped) {
            onStop()
        }
        unregisterServiceStartingReceiver()
    }

    private fun emitPendingProxyError() {
        val pendingError = conduitService?.consumePendingProxyError() ?: return
        if (pendingError.getString("action").isNullOrBlank()) {
            return
        }
        callback?.invoke("proxyError", pendingError)
    }

    private fun registerClientIfReady(reason: String) {
        val service = conduitService ?: return
        if (isStopped || callback == null) {
            return
        }
        try {
            service.registerClient(clientCallback)
            logInfo("Registered inproxy client callback: $reason")
            emitPendingProxyError()
        } catch (error: RemoteException) {
            logError("Failed to register inproxy client: $reason", error)
        }
    }

    private fun bindService() {
        if (isServiceBound) {
            return
        }
        logInfo("Binding to InproxyForegroundService")
        val intent = Intent(context, InproxyForegroundService::class.java)
        val bound = context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
        isServiceBound = bound
        if (!bound) {
            logWarn("bindService returned false")
        }
    }

    private fun registerServiceStartingReceiver() {
        if (isReceiverRegistered) {
            return
        }
        val filter = IntentFilter(InproxyForegroundService.SERVICE_STARTING_BROADCAST_INTENT)
        ContextCompat.registerReceiver(
            context,
            serviceStartingReceiver,
            filter,
            InproxyForegroundService.SERVICE_STARTING_BROADCAST_PERMISSION,
            null,
            ContextCompat.RECEIVER_EXPORTED,
        )
        isReceiverRegistered = true
    }

    private fun unregisterServiceStartingReceiver() {
        if (!isReceiverRegistered) {
            return
        }
        try {
            context.unregisterReceiver(serviceStartingReceiver)
        } catch (_: IllegalArgumentException) {
        }
        isReceiverRegistered = false
    }

}
