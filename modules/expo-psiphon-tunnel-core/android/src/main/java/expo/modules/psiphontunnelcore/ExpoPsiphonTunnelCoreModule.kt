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
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoPsiphonTunnelCoreModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.AppContextLost()

    private lateinit var conduitServiceInteractor: ConduitServiceInteractor
    private var hasInproxyObservers = false
    private var hasIpcObservers = false
    private var isInproxyReceiverRegistered = false
    private var isIpcReceiverRegistered = false

    private val inproxyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != InproxyForegroundService.BROADCAST_ACTION_EVENT) {
                return
            }

            val eventType = intent.getStringExtra(InproxyForegroundService.EXTRA_EVENT_TYPE) ?: return
            if (eventType != "proxyError") {
                return
            }
            val eventData = intent.getBundleExtra(InproxyForegroundService.EXTRA_EVENT_DATA) ?: Bundle()
            if (!hasInproxyObservers) {
                return
            }
            emitInproxyEvent(eventType, eventData)
        }
    }

    private val ipcReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != IpcEventQueue.BROADCAST_ACTION_EVENT) {
                return
            }
            if (!hasIpcObservers) {
                return
            }
            flushPendingIpcEvents()
        }
    }

    override fun definition() = ModuleDefinition {
        Name("ExpoPsiphonTunnelCoreModule")

        Events("inproxyEvent", "ipcEvent")

        OnCreate {
            conduitServiceInteractor = ConduitServiceInteractor(context.applicationContext)
        }

        OnDestroy {
            conduitServiceInteractor.onStop()
            conduitServiceInteractor.onDestroy()
            unregisterInproxyReceiverIfNeeded()
            unregisterIpcReceiverIfNeeded()
        }

        Function("logInfo") { tag: String, message: String ->
            AppLogStore.info(context.applicationContext, tag, message)
        }

        Function("logError") { tag: String, message: String ->
            AppLogStore.error(context.applicationContext, tag, message)
        }

        Function("logWarn") { tag: String, message: String ->
            AppLogStore.warn(context.applicationContext, tag, message)
        }

        AsyncFunction("sendFeedback") { inproxyId: String, promise: Promise ->
            try {
                val appContext = context.applicationContext
                val request = OneTimeWorkRequestBuilder<FeedbackWorker>()
                    .setInputData(FeedbackWorker.createInputData(inproxyId))
                    .setConstraints(
                        Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build(),
                    )
                    .build()
                WorkManager.getInstance(appContext)
                    .enqueueUniqueWork(
                        FeedbackWorker.UNIQUE_WORK_NAME,
                        ExistingWorkPolicy.KEEP,
                        request,
                    )
                AppLogStore.info(
                    appContext,
                    "ExpoPsiphonTunnelCoreModule",
                    "Feedback upload enqueued",
                )

                promise.resolve(null)
            } catch (error: Exception) {
                AppLogStore.error(
                    context.applicationContext,
                    "ExpoPsiphonTunnelCoreModule",
                    "Failed to schedule feedback upload: ${error.message}",
                )
                promise.reject("ERR_FEEDBACK_UPLOAD_FAILED", "Failed to schedule feedback upload", error)
            }
        }

        AsyncFunction("toggleInProxy") { params: Map<String, Any?>, promise: Promise ->
            try {
                val parsed = InproxyParameters.fromMap(params)
                if (parsed == null) {
                    promise.reject("INVALID_PARAMS", "Invalid in-proxy parameters", null)
                    return@AsyncFunction
                }
                InproxyForegroundService.toggle(context.applicationContext, parsed)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("TOGGLE_INPROXY_ERROR", "Failed to toggle in-proxy", e)
            }
        }

        AsyncFunction("paramsChanged") { params: Map<String, Any?>, promise: Promise ->
            try {
                val parsed = InproxyParameters.fromMap(params)
                if (parsed == null) {
                    promise.reject("INVALID_PARAMS", "Invalid in-proxy parameters", null)
                    return@AsyncFunction
                }
                InproxyForegroundService.paramsChanged(context.applicationContext, parsed)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("PARAMS_CHANGED_ERROR", "Failed to update in-proxy params", e)
            }
        }

        AsyncFunction("stopInProxy") { promise: Promise ->
            try {
                InproxyForegroundService.stop(context.applicationContext)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("STOP_INPROXY_ERROR", "Failed to stop in-proxy", e)
            }
        }

        Function("emitCurrentInproxyState") {
            InproxyForegroundService.emitCurrentState(context.applicationContext)
            InproxyForegroundService.emitPendingProxyError(context.applicationContext)
        }

        OnStartObserving("inproxyEvent") {
            hasInproxyObservers = true
            registerInproxyReceiverIfNeeded()
            conduitServiceInteractor.onStart { eventType, eventData ->
                if (!hasInproxyObservers) {
                    return@onStart
                }
                emitInproxyEvent(eventType, eventData)
            }
            InproxyForegroundService.emitPendingProxyError(context.applicationContext)
        }

        OnStopObserving("inproxyEvent") {
            hasInproxyObservers = false
            conduitServiceInteractor.onStop()
            unregisterInproxyReceiverIfNeeded()
        }

        OnStartObserving("ipcEvent") {
            hasIpcObservers = true
            registerIpcReceiverIfNeeded()
            flushPendingIpcEvents()
        }

        OnStopObserving("ipcEvent") {
            hasIpcObservers = false
            unregisterIpcReceiverIfNeeded()
        }
    }

    private fun emitInproxyEvent(eventType: String, eventData: Bundle) {
        val data = bundleToMap(eventData)
        val payload = mapOf(
            "type" to eventType,
            "data" to data,
        )
        sendEvent("inproxyEvent", payload)
    }

    private fun emitIpcEvent(eventType: String, eventData: Bundle) {
        val data = bundleToMap(eventData)
        val payload = mapOf(
            "type" to eventType,
            "data" to data,
        )
        sendEvent("ipcEvent", payload)
    }

    private fun flushPendingIpcEvents() {
        if (!hasIpcObservers) {
            return
        }
        IpcEventQueue.drainPending().forEach { pendingEvent ->
            emitIpcEvent(pendingEvent.eventType, pendingEvent.eventData)
        }
    }

    private fun registerInproxyReceiverIfNeeded() {
        if (isInproxyReceiverRegistered) {
            return
        }
        try {
            ContextCompat.registerReceiver(
                context.applicationContext,
                inproxyReceiver,
                IntentFilter(InproxyForegroundService.BROADCAST_ACTION_EVENT),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            isInproxyReceiverRegistered = true
        } catch (error: SecurityException) {
            AppLogStore.error(
                context.applicationContext,
                "ExpoPsiphonTunnelCoreModule",
                "Failed to register inproxy receiver: ${error.message}",
            )
        }
    }

    private fun unregisterInproxyReceiverIfNeeded() {
        if (!isInproxyReceiverRegistered) {
            return
        }
        try {
            context.applicationContext.unregisterReceiver(inproxyReceiver)
        } catch (_: IllegalArgumentException) {
        }
        isInproxyReceiverRegistered = false
    }

    private fun registerIpcReceiverIfNeeded() {
        if (isIpcReceiverRegistered) {
            return
        }
        try {
            ContextCompat.registerReceiver(
                context.applicationContext,
                ipcReceiver,
                IntentFilter(IpcEventQueue.BROADCAST_ACTION_EVENT),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            isIpcReceiverRegistered = true
        } catch (error: SecurityException) {
            AppLogStore.error(
                context.applicationContext,
                "ExpoPsiphonTunnelCoreModule",
                "Failed to register IPC receiver: ${error.message}",
            )
        }
    }

    private fun unregisterIpcReceiverIfNeeded() {
        if (!isIpcReceiverRegistered) {
            return
        }
        try {
            context.applicationContext.unregisterReceiver(ipcReceiver)
        } catch (_: IllegalArgumentException) {
        }
        isIpcReceiverRegistered = false
    }

    private fun bundleToMap(bundle: Bundle): Map<String, Any?> {
        val map = mutableMapOf<String, Any?>()
        for (key in bundle.keySet()) {
            map[key] = toSerializableValue(bundle.get(key))
        }
        return map
    }

    private fun toSerializableValue(value: Any?): Any? {
        return when (value) {
            is Bundle -> bundleToMap(value)
            is IntArray -> value.toList()
            is DoubleArray -> value.toList()
            is LongArray -> value.toList()
            is Array<*> -> value.map { element -> toSerializableValue(element) }
            is List<*> -> value.map { element -> toSerializableValue(element) }
            else -> value
        }
    }
}
