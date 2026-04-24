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
import android.util.Log
import androidx.core.content.ContextCompat
import ca.psiphon.conduit.nativemodule.IConduitClientCallback
import ca.psiphon.conduit.nativemodule.IConduitService

class ConduitServiceInteractor(private val context: Context) {
    companion object {
        const val SERVICE_STARTING_BROADCAST_PERMISSION =
            "ca.psiphon.conduit.nativemodule.SERVICE_STARTING_BROADCAST_PERMISSION"
        const val SERVICE_STARTING_BROADCAST_INTENT =
            "ca.psiphon.conduit.nativemodule.SERVICE_STARTING_BROADCAST_INTENT"
        private const val TAG = "ConduitServiceInteractor"
    }

    private var isStopped = true
    private var isServiceBound = false
    private var conduitService: IConduitService? = null
    private var callback: ((String, Bundle) -> Unit)? = null

    private val clientCallback = object : IConduitClientCallback.Stub() {
        override fun onProxyStateUpdated(proxyStateBundle: Bundle) {
            Log.i(TAG, "Received proxy state callback: ${proxyStateBundle.getString("status")}")
            callback?.invoke("proxyState", proxyStateBundle)
        }

        override fun onProxyActivityStatsUpdated(proxyActivityStatsBundle: Bundle) {
            callback?.invoke("inProxyActivityStats", proxyActivityStatsBundle)
        }
    }

    private val broadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == SERVICE_STARTING_BROADCAST_INTENT && !isStopped) {
                bindService()
            }
        }
    }

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            Log.i(TAG, "Connected to InproxyForegroundService")
            conduitService = IConduitService.Stub.asInterface(service)
            try {
                conduitService?.registerClient(clientCallback)
                Log.i(TAG, "Registered inproxy client callback")
            } catch (error: RemoteException) {
                Log.e(TAG, "Failed to register inproxy client", error)
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.i(TAG, "Disconnected from InproxyForegroundService")
            conduitService = null
            isServiceBound = false

            if (isStopped) {
                return
            }

            bindService()
        }
    }

    init {
        val intentFilter = IntentFilter(SERVICE_STARTING_BROADCAST_INTENT)
        try {
            ContextCompat.registerReceiver(
                context,
                broadcastReceiver,
                intentFilter,
                SERVICE_STARTING_BROADCAST_PERMISSION,
                null,
                ContextCompat.RECEIVER_EXPORTED,
            )
        } catch (error: SecurityException) {
            AppLogStore.error(
                context.applicationContext,
                TAG,
                "Failed to register service-start receiver: ${error.message}",
            )
        }
    }

    fun onStart(callback: (String, Bundle) -> Unit) {
        this.callback = callback
        isStopped = false
        Log.i(TAG, "Interactor start")
        bindService()
    }

    fun onStop() {
        isStopped = true
        Log.i(TAG, "Interactor stop")
        try {
            conduitService?.unregisterClient(clientCallback)
        } catch (error: RemoteException) {
            Log.e(TAG, "Failed to unregister inproxy client", error)
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

        try {
            conduitService?.registerClient(clientCallback)
        } catch (error: RemoteException) {
            Log.e(TAG, "Failed to request current inproxy state", error)
        }
    }

    fun onDestroy() {
        try {
            context.unregisterReceiver(broadcastReceiver)
        } catch (_: IllegalArgumentException) {
        }
    }

    private fun bindService() {
        if (isServiceBound) {
            return
        }
        Log.i(TAG, "Binding to InproxyForegroundService")
        val intent = Intent(context, InproxyForegroundService::class.java)
        val bound = context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
        isServiceBound = bound
        if (!bound) {
            Log.w(TAG, "bindService returned false")
        }
    }

}
