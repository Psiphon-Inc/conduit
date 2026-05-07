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

import android.content.Context
import android.os.Bundle
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
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
    private var isIpcListenerRegistered = false
    private var isInteractorStarted = false

    private val ipcEventListener = {
        flushPendingIpcEvents()
    }

    override fun definition() = ModuleDefinition {
        Name("ExpoPsiphonTunnelCoreModule")

        Events("inproxyEvent", "ipcEvent")

        OnCreate {
            conduitServiceInteractor = ConduitServiceInteractor(context.applicationContext)
            if (appContext.currentActivity != null) {
                startInteractorIfNeeded()
            }
            LogsMaintenanceWorker.schedule(context.applicationContext)
        }

        OnActivityEntersForeground {
            startInteractorIfNeeded()
        }

        OnActivityEntersBackground {
            stopInteractorIfNeeded()
        }

        OnDestroy {
            stopInteractorIfNeeded()
            if (::conduitServiceInteractor.isInitialized) {
                conduitServiceInteractor.onDestroy()
            }
            unregisterIpcListenerIfNeeded()
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
                val workManager = WorkManager.getInstance(appContext)
                if (hasPendingFeedbackUpload(workManager)) {
                    AppLogStore.info(
                        appContext,
                        "ExpoPsiphonTunnelCoreModule",
                        "Feedback upload already pending",
                    )
                    promise.resolve(null)
                    return@AsyncFunction
                }

                val inputData = FeedbackWorker.createInputData(inproxyId)
                val feedbackId = inputData.getString(FeedbackWorker.INPUT_FEEDBACK_ID)
                    ?: throw IllegalStateException("Missing generated feedback ID")
                AppLogStore.info(
                    appContext,
                    "ExpoPsiphonTunnelCoreModule",
                    "Feedback upload requested: $feedbackId",
                )
                FeedbackWorker.createFeedbackSnapshot(appContext, feedbackId)
                val request = OneTimeWorkRequestBuilder<FeedbackWorker>()
                    .setInputData(inputData)
                    .addTag(FeedbackWorker.tagForFeedbackId(feedbackId))
                    .setConstraints(
                        Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build(),
                    )
                    .build()
                workManager
                    .enqueueUniqueWork(
                        FeedbackWorker.UNIQUE_WORK_NAME,
                        ExistingWorkPolicy.REPLACE,
                        request,
                    )
                AppLogStore.info(
                    appContext,
                    "ExpoPsiphonTunnelCoreModule",
                    "Feedback upload enqueued",
                )

                promise.resolve(null)
            } catch (error: Exception) {
                if (error is InterruptedException) {
                    Thread.currentThread().interrupt()
                }
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
            startInteractorIfNeeded()
            conduitServiceInteractor.requestCurrentState()
        }

        OnStartObserving("inproxyEvent") {
            hasInproxyObservers = true
        }

        OnStopObserving("inproxyEvent") {
            hasInproxyObservers = false
        }

        OnStartObserving("ipcEvent") {
            hasIpcObservers = true
            registerIpcListenerIfNeeded()
            flushPendingIpcEvents()
        }

        OnStopObserving("ipcEvent") {
            hasIpcObservers = false
            unregisterIpcListenerIfNeeded()
        }
    }

    private fun hasPendingFeedbackUpload(workManager: WorkManager): Boolean {
        return workManager.getWorkInfosForUniqueWork(FeedbackWorker.UNIQUE_WORK_NAME)
            .get()
            .any { workInfo ->
                workInfo.state == WorkInfo.State.ENQUEUED || workInfo.state == WorkInfo.State.RUNNING
            }
    }

    private fun startInteractorIfNeeded() {
        if (!::conduitServiceInteractor.isInitialized || isInteractorStarted) {
            return
        }
        conduitServiceInteractor.onStart { eventType, eventData ->
            if (!hasInproxyObservers) {
                return@onStart
            }
            emitInproxyEvent(eventType, eventData)
        }
        isInteractorStarted = true
    }

    private fun stopInteractorIfNeeded() {
        if (!::conduitServiceInteractor.isInitialized || !isInteractorStarted) {
            return
        }
        conduitServiceInteractor.onStop()
        isInteractorStarted = false
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

    private fun registerIpcListenerIfNeeded() {
        if (isIpcListenerRegistered) {
            return
        }
        IpcEventQueue.registerListener(ipcEventListener)
        isIpcListenerRegistered = true
    }

    private fun unregisterIpcListenerIfNeeded() {
        if (!isIpcListenerRegistered) {
            return
        }
        IpcEventQueue.unregisterListener(ipcEventListener)
        isIpcListenerRegistered = false
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
