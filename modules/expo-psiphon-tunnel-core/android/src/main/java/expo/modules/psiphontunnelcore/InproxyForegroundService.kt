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

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Resources
import android.os.Build
import android.os.DeadObjectException
import android.os.IBinder
import android.os.Parcel
import android.os.RemoteException
import android.os.SystemClock
import android.text.format.Formatter
import android.util.Log
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import ca.psiphon.conduit.nativemodule.IConduitClientCallback
import ca.psiphon.conduit.nativemodule.IConduitService
import ca.psiphon.PsiphonTunnel
import expo.modules.psiphontunnelcore.stats.ProxyActivityStats
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.absoluteValue

class InproxyForegroundService : Service(), PsiphonTunnel.HostService {
    enum class Status {
        RUNNING,
        STOPPED,
        UNKNOWN,
    }

    enum class NetworkState {
        HAS_INTERNET,
        NO_INTERNET,
    }

    data class ProxyState(
        val status: Status,
        val networkState: NetworkState?,
    )

    data class ActivityStats(
        val elapsedTime: Long,
        val totalBytesUp: Double,
        val totalBytesDown: Double,
        val currentAnnouncingWorkers: Int,
        val currentConnectingClients: Int,
        val currentConnectedClients: Int,
        val bytesUpSeries: List<Double>,
        val bytesDownSeries: List<Double>,
        val announcingWorkersSeries: List<Int>,
        val connectingClientsSeries: List<Int>,
        val connectedClientsSeries: List<Int>,
        val hourlyBytesUpSeries: List<Double>,
        val hourlyBytesDownSeries: List<Double>,
        val hourlyAnnouncingWorkersSeries: List<Int>,
        val hourlyConnectingClientsSeries: List<Int>,
        val hourlyConnectedClientsSeries: List<Int>,
        val segments: ActivitySegments,
        val personalRegionActivity: List<RegionActivity>,
        val commonRegionActivity: List<RegionActivity>,
        val regionalBreakdownByWindow: RegionalBreakdownByWindow,
    )

    data class RegionalBreakdownByWindow(
        val window48h: RegionalBreakdownWindow,
        val window7d: RegionalBreakdownWindow,
        val window30d: RegionalBreakdownWindow,
    )

    data class RegionalBreakdownWindow(
        val personal: List<RegionActivity>,
        val common: List<RegionActivity>,
    )

    data class ActivitySegments(
        val personal: SegmentStats,
        val common: SegmentStats,
        val total: SegmentStats,
    )

    data class SegmentStats(
        val totalBytesUp: Double,
        val totalBytesDown: Double,
        val currentAnnouncingWorkers: Int,
        val currentConnectingClients: Int,
        val currentConnectedClients: Int,
        val bytesUpSeries: List<Double>,
        val bytesDownSeries: List<Double>,
        val announcingWorkersSeries: List<Int>,
        val connectingClientsSeries: List<Int>,
        val connectedClientsSeries: List<Int>,
        val hourlyBytesUpSeries: List<Double>,
        val hourlyBytesDownSeries: List<Double>,
        val hourlyAnnouncingWorkersSeries: List<Int>,
        val hourlyConnectingClientsSeries: List<Int>,
        val hourlyConnectedClientsSeries: List<Int>,
    )

    data class RegionActivity(
        val region: String,
        val connectingClients: Int,
        val connectedClients: Int,
        val bytesUp: Double,
        val bytesDown: Double,
    )

    private data class PendingProxyError(
        val action: String,
        val message: String?,
    )

    companion object {
        const val ACTION_TOGGLE_INPROXY = "expo.modules.psiphontunnelcore.action.TOGGLE_INPROXY"
        const val ACTION_PARAMS_CHANGED = "expo.modules.psiphontunnelcore.action.PARAMS_CHANGED"
        const val ACTION_STOP_INPROXY = "expo.modules.psiphontunnelcore.action.STOP_INPROXY"
        const val ACTION_START_INPROXY_WITH_LAST_PARAMS = "expo.modules.psiphontunnelcore.action.START_INPROXY_WITH_LAST_PARAMS"
        const val ACTION_EMIT_CURRENT_STATE = "expo.modules.psiphontunnelcore.action.EMIT_CURRENT_STATE"
        private const val ACTION_EMIT_PENDING_PROXY_ERROR =
            "expo.modules.psiphontunnelcore.action.EMIT_PENDING_PROXY_ERROR"

        const val BROADCAST_ACTION_EVENT = "expo.modules.psiphontunnelcore.action.INPROXY_EVENT"
        const val EXTRA_EVENT_TYPE = "eventType"
        const val EXTRA_EVENT_DATA = "eventData"

        private const val NOTIFICATION_CHANNEL_ID = "PsiphonTunnelCoreInproxyChannel"
        private const val NOTIFICATION_ID = 18489
        private const val ACTIVITY_NUM_BUCKETS_1000MS = ProxyActivityStats.MAX_BUCKETS_1000MS
        private const val ACTIVITY_NUM_BUCKETS_3600000MS = ProxyActivityStats.MAX_BUCKETS_3600000MS
        private const val REGIONAL_ACCUMULATOR_PERSIST_VERSION = 2
        private const val REGIONAL_ACCUMULATOR_PERSIST_VERSION_V1 = 1
        private const val REGIONAL_ACCUMULATOR_FILE_NAME = "inproxy_regional_breakdown_v1.json"
        private const val REGIONAL_ACCUMULATOR_PERSIST_INTERVAL_MS = 15_000L
        private const val BOOT_EPOCH_RESTORE_TOLERANCE_MS = 5 * 60 * 1000L
        private const val ACTIVITY_STATS_EMIT_INTERVAL_MS = 3_000L
        private const val PENDING_PROXY_ERROR_FILE = "pending_proxy_error.json"
        private const val LEGACY_PENDING_PROXY_ERROR_PREFS =
            "PsiphonTunnelCorePendingProxyError"
        private const val KEY_PENDING_ERROR_ACTION = "action"
        private const val KEY_PENDING_ERROR_MESSAGE = "message"
        const val SERVICE_STARTING_BROADCAST_PERMISSION =
            "ca.psiphon.conduit.nativemodule.SERVICE_STARTING_BROADCAST_PERMISSION"
        const val SERVICE_STARTING_BROADCAST_INTENT =
            "ca.psiphon.conduit.nativemodule.SERVICE_STARTING_BROADCAST_INTENT"

        @Volatile
        private var latestProxyState = ProxyState(Status.STOPPED, null)

        @Volatile
        private var latestStats = zeroActivityStats()

        private fun zeroSeries(bucketCount: Int): SegmentStats {
            return SegmentStats(
                totalBytesUp = 0.0,
                totalBytesDown = 0.0,
                currentAnnouncingWorkers = 0,
                currentConnectingClients = 0,
                currentConnectedClients = 0,
                bytesUpSeries = List(bucketCount) { 0.0 },
                bytesDownSeries = List(bucketCount) { 0.0 },
                announcingWorkersSeries = List(bucketCount) { 0 },
                connectingClientsSeries = List(bucketCount) { 0 },
                connectedClientsSeries = List(bucketCount) { 0 },
                hourlyBytesUpSeries = List(ACTIVITY_NUM_BUCKETS_3600000MS) { 0.0 },
                hourlyBytesDownSeries = List(ACTIVITY_NUM_BUCKETS_3600000MS) { 0.0 },
                hourlyAnnouncingWorkersSeries = List(ACTIVITY_NUM_BUCKETS_3600000MS) { 0 },
                hourlyConnectingClientsSeries = List(ACTIVITY_NUM_BUCKETS_3600000MS) { 0 },
                hourlyConnectedClientsSeries = List(ACTIVITY_NUM_BUCKETS_3600000MS) { 0 },
            )
        }

        private fun zeroActivityStats(): ActivityStats {
            val zeroTotal = zeroSeries(ACTIVITY_NUM_BUCKETS_1000MS)
            return ActivityStats(
                elapsedTime = 0,
                totalBytesUp = 0.0,
                totalBytesDown = 0.0,
                currentAnnouncingWorkers = 0,
                currentConnectingClients = 0,
                currentConnectedClients = 0,
                bytesUpSeries = zeroTotal.bytesUpSeries,
                bytesDownSeries = zeroTotal.bytesDownSeries,
                announcingWorkersSeries = zeroTotal.announcingWorkersSeries,
                connectingClientsSeries = zeroTotal.connectingClientsSeries,
                connectedClientsSeries = zeroTotal.connectedClientsSeries,
                hourlyBytesUpSeries = zeroTotal.hourlyBytesUpSeries,
                hourlyBytesDownSeries = zeroTotal.hourlyBytesDownSeries,
                hourlyAnnouncingWorkersSeries = zeroTotal.hourlyAnnouncingWorkersSeries,
                hourlyConnectingClientsSeries = zeroTotal.hourlyConnectingClientsSeries,
                hourlyConnectedClientsSeries = zeroTotal.hourlyConnectedClientsSeries,
                segments = ActivitySegments(
                    personal = zeroSeries(ACTIVITY_NUM_BUCKETS_1000MS),
                    common = zeroSeries(ACTIVITY_NUM_BUCKETS_1000MS),
                    total = zeroTotal,
                ),
                personalRegionActivity = emptyList(),
                commonRegionActivity = emptyList(),
                regionalBreakdownByWindow = RegionalBreakdownByWindow(
                    window48h = RegionalBreakdownWindow(emptyList(), emptyList()),
                    window7d = RegionalBreakdownWindow(emptyList(), emptyList()),
                    window30d = RegionalBreakdownWindow(emptyList(), emptyList()),
                ),
            )
        }

        fun toggle(context: Context, params: InproxyParameters) {
            val intent = Intent(context, InproxyForegroundService::class.java).apply {
                action = ACTION_TOGGLE_INPROXY
                params.putIntoIntent(this)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun paramsChanged(context: Context, params: InproxyParameters) {
            val intent = Intent(context, InproxyForegroundService::class.java).apply {
                action = ACTION_PARAMS_CHANGED
                params.putIntoIntent(this)
            }
            context.startService(intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, InproxyForegroundService::class.java).apply {
                action = ACTION_STOP_INPROXY
            }
            context.startService(intent)
        }

        fun startWithLastParams(context: Context) {
            val intent = Intent(context, InproxyForegroundService::class.java).apply {
                action = ACTION_START_INPROXY_WITH_LAST_PARAMS
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun emitCurrentState(context: Context) {
            val intent = Intent(context, InproxyForegroundService::class.java).apply {
                action = ACTION_EMIT_CURRENT_STATE
            }
            context.startService(intent)
        }

        fun emitPendingProxyError(context: Context) {
            val pendingError = loadPendingProxyError(context) ?: return
            emitProxyError(context, pendingError.action, pendingError.message)
            clearPendingProxyError(context)
        }

        private fun pendingProxyErrorFile(context: Context): File {
            return File(context.applicationContext.filesDir, PENDING_PROXY_ERROR_FILE)
        }

        private fun loadPendingProxyError(context: Context): PendingProxyError? {
            val filePayload = Utils.readJsonFile(pendingProxyErrorFile(context))
            if (filePayload != null) {
                val action =
                    filePayload.optString(KEY_PENDING_ERROR_ACTION)
                        ?.trim()
                        ?.takeIf { it.isNotEmpty() }
                        ?: return null
                return PendingProxyError(
                    action = action,
                    message = filePayload
                        .takeIf { it.has(KEY_PENDING_ERROR_MESSAGE) }
                        ?.optString(KEY_PENDING_ERROR_MESSAGE),
                )
            }

            val legacyPrefs = context.getSharedPreferences(
                LEGACY_PENDING_PROXY_ERROR_PREFS,
                Context.MODE_PRIVATE,
            )
            val legacyAction =
                legacyPrefs.getString(KEY_PENDING_ERROR_ACTION, null)
                    ?.trim()
                    ?.takeIf { it.isNotEmpty() }
                    ?: return null
            return PendingProxyError(
                action = legacyAction,
                message = legacyPrefs.getString(KEY_PENDING_ERROR_MESSAGE, null),
            )
        }

        private fun clearPendingProxyError(context: Context) {
            val file = pendingProxyErrorFile(context)
            if (file.exists()) {
                file.delete()
            }
            context.getSharedPreferences(
                LEGACY_PENDING_PROXY_ERROR_PREFS,
                Context.MODE_PRIVATE,
            )
                .edit()
                .remove(KEY_PENDING_ERROR_ACTION)
                .remove(KEY_PENDING_ERROR_MESSAGE)
                .apply()
        }

        private fun emitProxyState(context: Context, state: ProxyState) {
            val data = proxyStateBundle(state)
            emitEvent(context, "proxyState", data)
        }

        private fun emitProxyError(context: Context, action: String, message: String?) {
            val data = android.os.Bundle().apply {
                putString("action", action)
                putString("message", message)
            }
            emitEvent(context, "proxyError", data)
        }

        private fun emitActivityStats(context: Context, stats: ActivityStats) {
            val data = activityStatsBundle(stats)
            emitEvent(context, "inProxyActivityStats", data)
        }

        private fun proxyStateBundle(state: ProxyState): android.os.Bundle {
            return android.os.Bundle().apply {
                putString("status", state.status.name)
                putString("networkState", state.networkState?.name)
            }
        }

        private fun activityStatsBundle(stats: ActivityStats): android.os.Bundle {
            val bucket = activityPeriodBundle(
                bytesUpSeries = stats.bytesUpSeries,
                bytesDownSeries = stats.bytesDownSeries,
                announcingWorkersSeries = stats.announcingWorkersSeries,
                connectingClientsSeries = stats.connectingClientsSeries,
                connectedClientsSeries = stats.connectedClientsSeries,
                numBuckets = ACTIVITY_NUM_BUCKETS_1000MS,
            )
            val hourlyBucket = activityPeriodBundle(
                bytesUpSeries = stats.hourlyBytesUpSeries,
                bytesDownSeries = stats.hourlyBytesDownSeries,
                announcingWorkersSeries = stats.hourlyAnnouncingWorkersSeries,
                connectingClientsSeries = stats.hourlyConnectingClientsSeries,
                connectedClientsSeries = stats.hourlyConnectedClientsSeries,
                numBuckets = ACTIVITY_NUM_BUCKETS_3600000MS,
            )
            val dataByPeriod = android.os.Bundle().apply {
                putBundle("1000ms", bucket)
                putBundle("3600000ms", hourlyBucket)
            }
            return android.os.Bundle().apply {
                putDouble("elapsedTime", stats.elapsedTime.toDouble())
                putDouble("totalBytesUp", stats.totalBytesUp)
                putDouble("totalBytesDown", stats.totalBytesDown)
                putInt("currentAnnouncingWorkers", stats.currentAnnouncingWorkers)
                putInt("currentConnectingClients", stats.currentConnectingClients)
                putInt("currentConnectedClients", stats.currentConnectedClients)
                putBundle("dataByPeriod", dataByPeriod)
                putBundle("segments", activitySegmentsBundle(stats.segments))
                putBundle(
                    "regionalBreakdownByWindow",
                    regionalBreakdownByWindowBundle(stats.regionalBreakdownByWindow),
                )
            }
        }

        private fun regionalBreakdownByWindowBundle(
            breakdown: RegionalBreakdownByWindow,
        ): android.os.Bundle {
            return android.os.Bundle().apply {
                putBundle("48h", regionalBreakdownWindowBundle(breakdown.window48h))
                putBundle("7d", regionalBreakdownWindowBundle(breakdown.window7d))
                putBundle("30d", regionalBreakdownWindowBundle(breakdown.window30d))
            }
        }

        private fun regionalBreakdownWindowBundle(
            breakdown: RegionalBreakdownWindow,
        ): android.os.Bundle {
            return android.os.Bundle().apply {
                putParcelableArrayList(
                    "personal",
                    ArrayList(breakdown.personal.map { activity -> regionActivityBundle(activity) }),
                )
                putParcelableArrayList(
                    "common",
                    ArrayList(breakdown.common.map { activity -> regionActivityBundle(activity) }),
                )
            }
        }

        private fun activityPeriodBundle(
            bytesUpSeries: List<Double>,
            bytesDownSeries: List<Double>,
            announcingWorkersSeries: List<Int>,
            connectingClientsSeries: List<Int>,
            connectedClientsSeries: List<Int>,
            numBuckets: Int,
        ): android.os.Bundle {
            return android.os.Bundle().apply {
                putDoubleArray("bytesUp", bytesUpSeries.toDoubleArray())
                putDoubleArray("bytesDown", bytesDownSeries.toDoubleArray())
                putIntArray("announcingWorkers", announcingWorkersSeries.toIntArray())
                putIntArray("connectingClients", connectingClientsSeries.toIntArray())
                putIntArray("connectedClients", connectedClientsSeries.toIntArray())
                putInt("numBuckets", numBuckets)
            }
        }

        private fun activitySegmentsBundle(segments: ActivitySegments): android.os.Bundle {
            return android.os.Bundle().apply {
                putBundle("personal", segmentStatsBundle(segments.personal))
                putBundle("common", segmentStatsBundle(segments.common))
            }
        }

        private fun segmentStatsBundle(segment: SegmentStats): android.os.Bundle {
            val period1000ms = activityPeriodBundle(
                bytesUpSeries = segment.bytesUpSeries,
                bytesDownSeries = segment.bytesDownSeries,
                announcingWorkersSeries = segment.announcingWorkersSeries,
                connectingClientsSeries = segment.connectingClientsSeries,
                connectedClientsSeries = segment.connectedClientsSeries,
                numBuckets = ACTIVITY_NUM_BUCKETS_1000MS,
            )
            val period3600000ms = activityPeriodBundle(
                bytesUpSeries = segment.hourlyBytesUpSeries,
                bytesDownSeries = segment.hourlyBytesDownSeries,
                announcingWorkersSeries = segment.hourlyAnnouncingWorkersSeries,
                connectingClientsSeries = segment.hourlyConnectingClientsSeries,
                connectedClientsSeries = segment.hourlyConnectedClientsSeries,
                numBuckets = ACTIVITY_NUM_BUCKETS_3600000MS,
            )
            return android.os.Bundle().apply {
                putDouble("totalBytesUp", segment.totalBytesUp)
                putDouble("totalBytesDown", segment.totalBytesDown)
                putInt("currentAnnouncingWorkers", segment.currentAnnouncingWorkers)
                putInt("currentConnectingClients", segment.currentConnectingClients)
                putInt("currentConnectedClients", segment.currentConnectedClients)
                putBundle(
                    "dataByPeriod",
                    android.os.Bundle().apply {
                        putBundle("1000ms", period1000ms)
                        putBundle("3600000ms", period3600000ms)
                    },
                )
            }
        }

        private fun regionActivityBundle(activity: RegionActivity): android.os.Bundle {
            return android.os.Bundle().apply {
                putString("region", activity.region)
                putInt("connectingClients", activity.connectingClients)
                putInt("connectedClients", activity.connectedClients)
                putDouble("bytesUp", activity.bytesUp)
                putDouble("bytesDown", activity.bytesDown)
            }
        }

        private fun emitEvent(context: Context, eventType: String, data: android.os.Bundle) {
            val intent = Intent(BROADCAST_ACTION_EVENT).apply {
                setPackage(context.packageName)
                putExtra(EXTRA_EVENT_TYPE, eventType)
                putExtra(EXTRA_EVENT_DATA, data)
            }
            context.sendBroadcast(intent)
        }
    }

    private val tag = "InproxyForegroundService"
    private val psiphonTunnel: PsiphonTunnel = PsiphonTunnel.newPsiphonTunnel(this)
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val isRunning = AtomicBoolean(false)
    private val clients = ConcurrentHashMap<IBinder, IConduitClientCallback>()
    private val clientsLock = Any()
    private val statsLock = Any()
    private var stopLatch: CountDownLatch? = null
    private var proxyActivityStats = ProxyActivityStats()
    private var personalProxyActivityStats = ProxyActivityStats()
    private var commonProxyActivityStats = ProxyActivityStats()
    private var stats = latestStats
    private var state = latestProxyState
    private var activityEmitter: ScheduledExecutorService? = null
    private var activityCallbackCount = 0L
    private var latestAnnouncingWorkers = 0
    private var latestConnectingClients = 0
    private var latestConnectedClients = 0
    private var latestPersonalConnectingClients = 0
    private var latestPersonalConnectedClients = 0
    private var latestCommonConnectingClients = 0
    private var latestCommonConnectedClients = 0
    private var latestPersonalRegionActivity: List<RegionActivity> = emptyList()
    private var latestCommonRegionActivity: List<RegionActivity> = emptyList()
    private val personalRegionalAccumulator = RegionalByteAccumulator()
    private val commonRegionalAccumulator = RegionalByteAccumulator()
    private var regionalAccumulatorDirty = false
    private var statsPersistenceDirty = false
    private var lastRegionalAccumulatorPersistMs = 0L
    private var lastActivityStatsEmitMs = 0L

    private val binder = object : IConduitService.Stub() {
        override fun registerClient(client: IConduitClientCallback?) {
            if (client == null) {
                return
            }
            synchronized(clientsLock) {
                val clientBinder = client.asBinder()
                clients[clientBinder] = client
                Log.i(tag, "Client registered, total=${clients.size}")
                try {
                    client.onProxyStateUpdated(proxyStateBundle(state))
                } catch (error: RemoteException) {
                    Log.e(tag, "Failed to send proxy state update to client", error)
                }
                try {
                    client.onProxyActivityStatsUpdated(activityStatsBundle(stats))
                } catch (error: RemoteException) {
                    Log.e(tag, "Failed to send proxy activity stats update to client", error)
                }
            }
        }

        override fun unregisterClient(client: IConduitClientCallback?) {
            if (client == null) {
                return
            }
            synchronized(clientsLock) {
                clients.remove(client.asBinder())
                Log.i(tag, "Client unregistered, total=${clients.size}")
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? {
        return binder
    }

    override fun onCreate() {
        super.onCreate()
        ensureNotificationChannel()
        loadRegionalAccumulatorsFromDisk()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: return START_NOT_STICKY
        when (action) {
            ACTION_TOGGLE_INPROXY -> handleToggle(intent)
            ACTION_PARAMS_CHANGED -> handleParamsChanged(intent)
            ACTION_STOP_INPROXY -> stopInproxy("manual stop")
            ACTION_START_INPROXY_WITH_LAST_PARAMS -> handleStartWithLastParams()
            ACTION_EMIT_CURRENT_STATE -> emitCurrentLocalState()
            ACTION_EMIT_PENDING_PROXY_ERROR -> emitPendingProxyError(applicationContext)
            else -> Log.w(tag, "Unknown action: $action")
        }
        if (!isRunning.get()) {
            stopSelf(startId)
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        maybePersistRegionalAccumulators(force = true)
        stopActivityEmitter()
        executor.shutdownNow()
        synchronized(clientsLock) {
            clients.clear()
        }
    }

    private fun handleToggle(intent: Intent) {
        if (isRunning.get()) {
            stopInproxy("toggle stop")
            return
        }
        val params = InproxyParameters.fromIntent(intent)
        if (params == null) {
            reportProxyError(
                action = "inProxyStartFailed",
                message = "Invalid inproxy parameters",
                notificationTextResId = R.string.notification_conduit_failed_to_start_text,
            )
            return
        }
        params.store(applicationContext)
        startInproxy(params)
    }

    private fun handleParamsChanged(intent: Intent) {
        val params = InproxyParameters.fromIntent(intent)
        if (params == null) {
            reportProxyError(
                action = "inProxyRestartFailed",
                message = "Invalid inproxy parameters",
                notificationTextResId = R.string.notification_conduit_failed_to_restart_text,
            )
            return
        }
        val changed = params.store(applicationContext)
        if (!changed) {
            return
        }
        if (isRunning.get()) {
            try {
                resetStats()
                psiphonTunnel.restartPsiphon()
            } catch (e: Exception) {
                Log.e(tag, "Failed to restart in-proxy tunnel", e)
                reportProxyError(
                    action = "inProxyRestartFailed",
                    message = e.message,
                    notificationTextResId = R.string.notification_conduit_failed_to_restart_text,
                )
                stopInproxy("restart failed")
            }
        }
    }

    private fun handleStartWithLastParams() {
        if (isRunning.get()) {
            return
        }
        val params = InproxyParameters.load(applicationContext)
        if (params == null) {
            Log.w(tag, "No persisted inproxy parameters available")
            return
        }
        startInproxy(params)
    }

    private fun emitCurrentLocalState() {
        publishProxyState(state)
        maybeEmitActivityStats(stats, force = true)
        emitPendingProxyError(applicationContext)
    }

    private fun startInproxy(params: InproxyParameters) {
        if (!isRunning.compareAndSet(false, true)) {
            return
        }

        Utils.setServiceRunningFlag(applicationContext, true)
        resetStats()
        startActivityEmitter()
        sendServiceStartingBroadcast()

        state = ProxyState(Status.RUNNING, NetworkState.HAS_INTERNET)
        latestProxyState = state
        publishProxyState(state)

        startForeground(NOTIFICATION_ID, buildNotification())

        stopLatch = CountDownLatch(1)
        executor.submit {
            try {
                psiphonTunnel.startTunneling(Utils.getEmbeddedServers(this))
                stopLatch?.await()
            } catch (e: PsiphonTunnel.Exception) {
                Log.e(tag, "Failed to start inproxy", e)
                reportProxyError(
                    action = "inProxyStartFailed",
                    message = e.message,
                    notificationTextResId = R.string.notification_conduit_failed_to_start_text,
                )
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
            } finally {
                psiphonTunnel.stop()
                isRunning.set(false)
                stopActivityEmitter()
                Utils.setServiceRunningFlag(applicationContext, false)
                state = ProxyState(Status.STOPPED, null)
                latestProxyState = state
                publishProxyState(state)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                } else {
                    @Suppress("DEPRECATION")
                    stopForeground(true)
                }
                stopSelf()
            }
        }
    }

    private fun stopInproxy(reason: String) {
        if (!isRunning.get()) {
            return
        }
        Log.i(tag, "Stopping inproxy: $reason")
        synchronized(statsLock) {
            latestAnnouncingWorkers = 0
            latestConnectingClients = 0
            latestConnectedClients = 0
            latestPersonalConnectingClients = 0
            latestPersonalConnectedClients = 0
            latestCommonConnectingClients = 0
            latestCommonConnectedClients = 0
            latestPersonalRegionActivity = emptyList()
            latestCommonRegionActivity = emptyList()

            proxyActivityStats.add(0, 0, 0, 0, 0)
            personalProxyActivityStats.add(0, 0, 0, 0, 0)
            commonProxyActivityStats.add(0, 0, 0, 0, 0)

            stats = snapshotFromProxyActivityStats(
                totalSource = proxyActivityStats,
                personalSource = personalProxyActivityStats,
                commonSource = commonProxyActivityStats,
                personalRegionActivity = latestPersonalRegionActivity,
                commonRegionActivity = latestCommonRegionActivity,
            )
            latestStats = stats
            statsPersistenceDirty = true
            lastActivityStatsEmitMs = 0L
        }
        maybeEmitActivityStats(latestStats, force = true)
        maybePersistRegionalAccumulators(force = true)
        Utils.setServiceRunningFlag(applicationContext, false)
        stopLatch?.countDown()
        psiphonTunnel.stop()
    }

    private fun resetStats() {
        synchronized(statsLock) {
            proxyActivityStats.add(0, 0, 0, 0, 0)
            personalProxyActivityStats.add(0, 0, 0, 0, 0)
            commonProxyActivityStats.add(0, 0, 0, 0, 0)
            latestPersonalRegionActivity = emptyList()
            latestCommonRegionActivity = emptyList()
            stats = snapshotFromProxyActivityStats(
                totalSource = proxyActivityStats,
                personalSource = personalProxyActivityStats,
                commonSource = commonProxyActivityStats,
                personalRegionActivity = latestPersonalRegionActivity,
                commonRegionActivity = latestCommonRegionActivity,
            )
            latestStats = stats
            activityCallbackCount = 0L
            latestAnnouncingWorkers = 0
            latestConnectingClients = 0
            latestConnectedClients = 0
            latestPersonalConnectingClients = 0
            latestPersonalConnectedClients = 0
            latestCommonConnectingClients = 0
            latestCommonConnectedClients = 0
            statsPersistenceDirty = true
            lastActivityStatsEmitMs = 0L
        }
        maybeEmitActivityStats(latestStats, force = true)
        maybePersistRegionalAccumulators(force = false)
    }

    private fun startActivityEmitter() {
        stopActivityEmitter()
        activityEmitter = Executors.newSingleThreadScheduledExecutor()
        activityEmitter?.scheduleAtFixedRate(
            { emitActivityTick() },
            0,
            ProxyActivityStats.BUCKET_PERIOD_MILLISECONDS,
            TimeUnit.MILLISECONDS,
        )
    }

    private fun stopActivityEmitter() {
        activityEmitter?.shutdownNow()
        activityEmitter = null
    }

    private fun emitActivityTick() {
        if (!isRunning.get()) {
            return
        }

        val snapshot = synchronized(statsLock) {
            // Keep occupancy metrics represented in every bucket even when
            // the core emits activity callbacks only on changes.
            proxyActivityStats.add(
                0,
                0,
                latestAnnouncingWorkers,
                latestConnectingClients,
                latestConnectedClients,
            )
            personalProxyActivityStats.add(
                0,
                0,
                0,
                latestPersonalConnectingClients,
                latestPersonalConnectedClients,
            )
            commonProxyActivityStats.add(
                0,
                0,
                0,
                latestCommonConnectingClients,
                latestCommonConnectedClients,
            )
            snapshotFromProxyActivityStats(
                totalSource = proxyActivityStats,
                personalSource = personalProxyActivityStats,
                commonSource = commonProxyActivityStats,
                personalRegionActivity = latestPersonalRegionActivity,
                commonRegionActivity = latestCommonRegionActivity,
            )
                .also {
                    statsPersistenceDirty = true
                }
        }

        stats = snapshot
        latestStats = snapshot
        maybeEmitActivityStats(snapshot, force = false)
        maybePersistRegionalAccumulators(force = false)
    }

    private fun snapshotFromProxyActivityStats(
        totalSource: ProxyActivityStats,
        personalSource: ProxyActivityStats,
        commonSource: ProxyActivityStats,
        personalRegionActivity: List<RegionActivity>,
        commonRegionActivity: List<RegionActivity>,
    ): ActivityStats {
        val totalSegment = segmentFromProxyActivityStats(totalSource)
        val personalSegment = segmentFromProxyActivityStats(personalSource)
        val commonSegment = segmentFromProxyActivityStats(commonSource)
        val regionalBreakdownByWindow = RegionalBreakdownByWindow(
            window48h = RegionalBreakdownWindow(
                personal = personalRegionalAccumulator.toRegionActivity(hours = 48),
                common = commonRegionalAccumulator.toRegionActivity(hours = 48),
            ),
            window7d = RegionalBreakdownWindow(
                personal = personalRegionalAccumulator.toRegionActivity(hours = 7 * 24),
                common = commonRegionalAccumulator.toRegionActivity(hours = 7 * 24),
            ),
            window30d = RegionalBreakdownWindow(
                personal = personalRegionalAccumulator.toRegionActivity(hours = 30 * 24),
                common = commonRegionalAccumulator.toRegionActivity(hours = 30 * 24),
            ),
        )
        return ActivityStats(
            elapsedTime = totalSource.elapsedTime,
            totalBytesUp = totalSource.totalBytesUp.toDouble(),
            totalBytesDown = totalSource.totalBytesDown.toDouble(),
            currentAnnouncingWorkers = totalSource.currentAnnouncingWorkers,
            currentConnectingClients = totalSource.currentConnectingClients,
            currentConnectedClients = totalSource.currentConnectedClients,
            bytesUpSeries = totalSegment.bytesUpSeries,
            bytesDownSeries = totalSegment.bytesDownSeries,
            announcingWorkersSeries = totalSegment.announcingWorkersSeries,
            connectingClientsSeries = totalSegment.connectingClientsSeries,
            connectedClientsSeries = totalSegment.connectedClientsSeries,
            hourlyBytesUpSeries = totalSegment.hourlyBytesUpSeries,
            hourlyBytesDownSeries = totalSegment.hourlyBytesDownSeries,
            hourlyAnnouncingWorkersSeries = totalSegment.hourlyAnnouncingWorkersSeries,
            hourlyConnectingClientsSeries = totalSegment.hourlyConnectingClientsSeries,
            hourlyConnectedClientsSeries = totalSegment.hourlyConnectedClientsSeries,
            segments = ActivitySegments(
                personal = personalSegment,
                common = commonSegment,
                total = totalSegment,
            ),
            personalRegionActivity = personalRegionActivity,
            commonRegionActivity = commonRegionActivity,
            regionalBreakdownByWindow = regionalBreakdownByWindow,
        )
    }

    private fun segmentFromProxyActivityStats(source: ProxyActivityStats): SegmentStats {
        return SegmentStats(
            totalBytesUp = source.totalBytesUp.toDouble(),
            totalBytesDown = source.totalBytesDown.toDouble(),
            currentAnnouncingWorkers = source.currentAnnouncingWorkers,
            currentConnectingClients = source.currentConnectingClients,
            currentConnectedClients = source.currentConnectedClients,
            bytesUpSeries =
                source.getBytesUpSeries(ProxyActivityStats.BUCKET_COLLECTION_1000MS)
                    .map { it.toDouble() },
            bytesDownSeries =
                source.getBytesDownSeries(ProxyActivityStats.BUCKET_COLLECTION_1000MS)
                    .map { it.toDouble() },
            announcingWorkersSeries =
                source.getAnnouncingWorkersSeries(ProxyActivityStats.BUCKET_COLLECTION_1000MS)
                    .map { it.toInt() },
            connectingClientsSeries =
                source.getConnectingClientsSeries(ProxyActivityStats.BUCKET_COLLECTION_1000MS)
                    .map { it.toInt() },
            connectedClientsSeries =
                source.getConnectedClientsSeries(ProxyActivityStats.BUCKET_COLLECTION_1000MS)
                    .map { it.toInt() },
            hourlyBytesUpSeries =
                source.getBytesUpSeries(ProxyActivityStats.BUCKET_COLLECTION_3600000MS)
                    .map { it.toDouble() },
            hourlyBytesDownSeries =
                source.getBytesDownSeries(ProxyActivityStats.BUCKET_COLLECTION_3600000MS)
                    .map { it.toDouble() },
            hourlyAnnouncingWorkersSeries =
                source.getAnnouncingWorkersSeries(ProxyActivityStats.BUCKET_COLLECTION_3600000MS)
                    .map { it.toInt() },
            hourlyConnectingClientsSeries =
                source.getConnectingClientsSeries(ProxyActivityStats.BUCKET_COLLECTION_3600000MS)
                    .map { it.toInt() },
            hourlyConnectedClientsSeries =
                source.getConnectedClientsSeries(ProxyActivityStats.BUCKET_COLLECTION_3600000MS)
                    .map { it.toInt() },
        )
    }

    private fun regionalAccumulatorFile(): File {
        return File(filesDir, REGIONAL_ACCUMULATOR_FILE_NAME)
    }

    private fun loadRegionalAccumulatorsFromDisk() {
        val file = regionalAccumulatorFile()
        if (!file.exists()) {
            return
        }

        try {
            val payload = JSONObject(file.readText(Charsets.UTF_8))
            val payloadVersion = payload.optInt("version", -1)
            if (
                payloadVersion != REGIONAL_ACCUMULATOR_PERSIST_VERSION &&
                    payloadVersion != REGIONAL_ACCUMULATOR_PERSIST_VERSION_V1
            ) {
                Log.w(tag, "Ignoring regional accumulator payload version=$payloadVersion")
                return
            }

            synchronized(statsLock) {
                personalRegionalAccumulator.restoreFromPersistedJson(
                    payload.optJSONObject("personal"),
                )
                commonRegionalAccumulator.restoreFromPersistedJson(
                    payload.optJSONObject("common"),
                )

                if (payloadVersion >= REGIONAL_ACCUMULATOR_PERSIST_VERSION) {
                    val persistedBootEpochMs = payload.optLong("bootEpochMs", Long.MIN_VALUE)
                    val canRestoreProxyStats =
                        persistedBootEpochMs != Long.MIN_VALUE &&
                            (currentBootEpochMs() - persistedBootEpochMs).absoluteValue <=
                            BOOT_EPOCH_RESTORE_TOLERANCE_MS
                    if (canRestoreProxyStats) {
                        val restoredTotal = unmarshalProxyActivityStats(
                            payload.optString("totalProxyActivityStats", ""),
                        )
                        val restoredPersonal = unmarshalProxyActivityStats(
                            payload.optString("personalProxyActivityStats", ""),
                        )
                        val restoredCommon = unmarshalProxyActivityStats(
                            payload.optString("commonProxyActivityStats", ""),
                        )
                        if (
                            restoredTotal != null &&
                                restoredPersonal != null &&
                                restoredCommon != null
                        ) {
                            proxyActivityStats = restoredTotal
                            personalProxyActivityStats = restoredPersonal
                            commonProxyActivityStats = restoredCommon
                        }
                    } else {
                        Log.i(
                            tag,
                            "Skipping proxy activity restore due to boot epoch mismatch",
                        )
                    }
                }

                latestPersonalRegionActivity = emptyList()
                latestCommonRegionActivity = emptyList()
                stats = snapshotFromProxyActivityStats(
                    totalSource = proxyActivityStats,
                    personalSource = personalProxyActivityStats,
                    commonSource = commonProxyActivityStats,
                    personalRegionActivity = latestPersonalRegionActivity,
                    commonRegionActivity = latestCommonRegionActivity,
                )
                latestStats = stats
                latestAnnouncingWorkers = stats.currentAnnouncingWorkers
                latestConnectingClients = stats.currentConnectingClients
                latestConnectedClients = stats.currentConnectedClients
                latestPersonalConnectingClients = stats.segments.personal.currentConnectingClients
                latestPersonalConnectedClients = stats.segments.personal.currentConnectedClients
                latestCommonConnectingClients = stats.segments.common.currentConnectingClients
                latestCommonConnectedClients = stats.segments.common.currentConnectedClients
                regionalAccumulatorDirty = false
                statsPersistenceDirty = false
                lastRegionalAccumulatorPersistMs = System.currentTimeMillis()
            }
            Log.i(tag, "Loaded persisted regional breakdown state")
        } catch (e: Exception) {
            Log.w(tag, "Failed to load persisted regional breakdown state", e)
        }
    }

    private fun maybePersistRegionalAccumulators(force: Boolean) {
        val nowMs = System.currentTimeMillis()
        val payloadJson = synchronized(statsLock) {
            if (!force && !regionalAccumulatorDirty && !statsPersistenceDirty) {
                return@synchronized null
            }
            if (
                !force &&
                    nowMs - lastRegionalAccumulatorPersistMs <
                    REGIONAL_ACCUMULATOR_PERSIST_INTERVAL_MS
            ) {
                return@synchronized null
            }

            JSONObject()
                .put("version", REGIONAL_ACCUMULATOR_PERSIST_VERSION)
                .put("bootEpochMs", currentBootEpochMs())
                .put("personal", personalRegionalAccumulator.toPersistedJson())
                .put("common", commonRegionalAccumulator.toPersistedJson())
                .put(
                    "totalProxyActivityStats",
                    marshalProxyActivityStats(proxyActivityStats),
                )
                .put(
                    "personalProxyActivityStats",
                    marshalProxyActivityStats(personalProxyActivityStats),
                )
                .put(
                    "commonProxyActivityStats",
                    marshalProxyActivityStats(commonProxyActivityStats),
                )
        } ?: return

        val file = regionalAccumulatorFile()
        val tmpFile = File(file.parentFile, "${file.name}.tmp")
        try {
            tmpFile.parentFile?.mkdirs()
            tmpFile.writeText(payloadJson.toString(), Charsets.UTF_8)

            if (!tmpFile.renameTo(file)) {
                file.writeText(payloadJson.toString(), Charsets.UTF_8)
                tmpFile.delete()
            }

            synchronized(statsLock) {
                regionalAccumulatorDirty = false
                statsPersistenceDirty = false
                lastRegionalAccumulatorPersistMs = nowMs
            }
        } catch (e: Exception) {
            Log.w(tag, "Failed to persist regional breakdown state", e)
        }
    }

    private fun currentBootEpochMs(): Long {
        return System.currentTimeMillis() - SystemClock.elapsedRealtime()
    }

    private fun marshalProxyActivityStats(stats: ProxyActivityStats): String? {
        val parcel = Parcel.obtain()
        return try {
            parcel.writeParcelable(stats, 0)
            val bytes = parcel.marshall()
            Base64.encodeToString(bytes, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.w(tag, "Failed to marshal proxy activity stats", e)
            null
        } finally {
            parcel.recycle()
        }
    }

    private fun unmarshalProxyActivityStats(encoded: String?): ProxyActivityStats? {
        if (encoded.isNullOrBlank()) {
            return null
        }

        val bytes = try {
            Base64.decode(encoded, Base64.DEFAULT)
        } catch (_: IllegalArgumentException) {
            return null
        }

        val parcel = Parcel.obtain()
        return try {
            parcel.unmarshall(bytes, 0, bytes.size)
            parcel.setDataPosition(0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                parcel.readParcelable(
                    ProxyActivityStats::class.java.classLoader,
                    ProxyActivityStats::class.java,
                )
            } else {
                @Suppress("DEPRECATION")
                parcel.readParcelable(ProxyActivityStats::class.java.classLoader)
            }
        } catch (e: Exception) {
            Log.w(tag, "Failed to unmarshal proxy activity stats", e)
            null
        } finally {
            parcel.recycle()
        }
    }

    private data class RegionActivitySnapshotData(
        val regionActivity: List<RegionActivity>,
        val connectingClients: Int,
        val connectedClients: Int,
        val bytesUp: Long,
        val bytesDown: Long,
    )

    private data class RegionalHourBucket(
        val hourStartMs: Long,
        val bytesByRegion: MutableMap<String, Long>,
    )

    private class RegionalByteAccumulator {
        private val buckets = mutableListOf<RegionalHourBucket>()
        private var previousTotalsByRegion: Map<String, Long> = emptyMap()
        private var latestConnectedByRegion: Map<String, Int> = emptyMap()

        fun reset() {
            buckets.clear()
            previousTotalsByRegion = emptyMap()
            latestConnectedByRegion = emptyMap()
        }

        fun ingest(snapshot: List<RegionActivity>, timestampMs: Long) {
            val hourStartMs = timestampMs - (timestampMs % TimeUnit.HOURS.toMillis(1))
            val bucket = ensureBucket(hourStartMs)
            val currentTotalsByRegion = snapshot.associate { activity ->
                activity.region to (activity.bytesUp + activity.bytesDown).toLong()
            }

            for ((region, currentTotal) in currentTotalsByRegion) {
                val previousTotal = previousTotalsByRegion[region] ?: 0L
                val delta =
                    if (currentTotal >= previousTotal) {
                        currentTotal - previousTotal
                    } else {
                        currentTotal
                    }
                if (delta > 0L) {
                    bucket.bytesByRegion[region] =
                        (bucket.bytesByRegion[region] ?: 0L) + delta
                }
            }

            previousTotalsByRegion = currentTotalsByRegion
            latestConnectedByRegion = snapshot.associate { activity ->
                activity.region to activity.connectedClients
            }
        }

        fun toPersistedJson(): JSONObject {
            val bucketsJson = JSONArray()
            for (bucket in buckets) {
                bucketsJson.put(
                    JSONObject()
                        .put("hourStartMs", bucket.hourStartMs)
                        .put("bytesByRegion", longMapToJson(bucket.bytesByRegion)),
                )
            }

            return JSONObject()
                .put("buckets", bucketsJson)
                .put("previousTotalsByRegion", longMapToJson(previousTotalsByRegion))
                .put("latestConnectedByRegion", intMapToJson(latestConnectedByRegion))
        }

        fun restoreFromPersistedJson(json: JSONObject?) {
            reset()
            if (json == null) {
                return
            }

            val bucketsJson = json.optJSONArray("buckets") ?: JSONArray()
            for (index in 0 until bucketsJson.length()) {
                val bucketJson = bucketsJson.optJSONObject(index) ?: continue
                val hourStartMs = bucketJson.optLong("hourStartMs", Long.MIN_VALUE)
                if (hourStartMs == Long.MIN_VALUE) {
                    continue
                }
                val bytesByRegion = jsonToLongMap(bucketJson.optJSONObject("bytesByRegion"))
                buckets.add(
                    RegionalHourBucket(
                        hourStartMs = hourStartMs,
                        bytesByRegion = bytesByRegion.toMutableMap(),
                    ),
                )
            }

            buckets.sortBy { bucket -> bucket.hourStartMs }
            while (buckets.size > ACTIVITY_NUM_BUCKETS_3600000MS) {
                buckets.removeAt(0)
            }

            previousTotalsByRegion = jsonToLongMap(json.optJSONObject("previousTotalsByRegion"))
            latestConnectedByRegion = jsonToIntMap(json.optJSONObject("latestConnectedByRegion"))
        }

        fun toRegionActivity(hours: Int): List<RegionActivity> {
            if (hours <= 0 || buckets.isEmpty()) {
                return emptyList()
            }

            val latestHourStartMs = buckets.last().hourStartMs
            val cutoffHourStartMs =
                latestHourStartMs - (hours - 1) * TimeUnit.HOURS.toMillis(1)
            val bytesByRegion = mutableMapOf<String, Long>()

            for (bucket in buckets) {
                if (bucket.hourStartMs < cutoffHourStartMs) {
                    continue
                }
                for ((region, bytes) in bucket.bytesByRegion) {
                    bytesByRegion[region] = (bytesByRegion[region] ?: 0L) + bytes
                }
            }

            return bytesByRegion
                .map { (region, bytesTransferred) ->
                    RegionActivity(
                        region = region,
                        connectingClients = 0,
                        connectedClients = latestConnectedByRegion[region] ?: 0,
                        bytesUp = bytesTransferred.toDouble(),
                        bytesDown = 0.0,
                    )
                }
                .sortedByDescending { activity ->
                    activity.bytesUp + activity.bytesDown
                }
        }

        private fun ensureBucket(hourStartMs: Long): RegionalHourBucket {
            val existing = buckets.lastOrNull()
            if (existing != null && existing.hourStartMs == hourStartMs) {
                return existing
            }

            val created = RegionalHourBucket(
                hourStartMs = hourStartMs,
                bytesByRegion = mutableMapOf(),
            )
            buckets.add(created)
            if (buckets.size > ACTIVITY_NUM_BUCKETS_3600000MS) {
                buckets.removeAt(0)
            }
            return created
        }

        private fun longMapToJson(map: Map<String, Long>): JSONObject {
            val output = JSONObject()
            map.forEach { (key, value) ->
                output.put(key, value)
            }
            return output
        }

        private fun intMapToJson(map: Map<String, Int>): JSONObject {
            val output = JSONObject()
            map.forEach { (key, value) ->
                output.put(key, value)
            }
            return output
        }

        private fun jsonToLongMap(json: JSONObject?): Map<String, Long> {
            if (json == null) {
                return emptyMap()
            }
            val output = mutableMapOf<String, Long>()
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                output[key] = json.optLong(key, 0L)
            }
            return output
        }

        private fun jsonToIntMap(json: JSONObject?): Map<String, Int> {
            if (json == null) {
                return emptyMap()
            }
            val output = mutableMapOf<String, Int>()
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                output[key] = json.optInt(key, 0)
            }
            return output
        }
    }

    private fun parseRegionActivity(
        regionMap: Map<String, PsiphonTunnel.RegionActivitySnapshot>,
    ): RegionActivitySnapshotData {
        val snapshot = mutableListOf<RegionActivity>()
        var totalConnecting = 0
        var totalConnected = 0
        var totalBytesUp = 0L
        var totalBytesDown = 0L

        regionMap.forEach { (region, activity) ->
            val connectingClients = activity.connectingClients
            val connectedClients = activity.connectedClients
            val bytesUp = activity.bytesUp
            val bytesDown = activity.bytesDown
            totalConnecting += connectingClients
            totalConnected += connectedClients
            totalBytesUp += bytesUp
            totalBytesDown += bytesDown
            snapshot.add(
                RegionActivity(
                    region = region,
                    connectingClients = connectingClients,
                    connectedClients = connectedClients,
                    bytesUp = bytesUp.toDouble(),
                    bytesDown = bytesDown.toDouble(),
                ),
            )
        }

        return RegionActivitySnapshotData(
            regionActivity = snapshot,
            connectingClients = totalConnecting,
            connectedClients = totalConnected,
            bytesUp = totalBytesUp,
            bytesDown = totalBytesDown,
        )
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            appName(),
            NotificationManager.IMPORTANCE_LOW,
        )
        channel.description = getString(R.string.conduit_service_channel_description)
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val stopIntent = Intent(this, InproxyForegroundService::class.java).apply {
            action = ACTION_STOP_INPROXY
        }
        val stopPendingIntent = PendingIntent.getService(
            applicationContext,
            0,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val (notificationIconId, shortText, longText) =
            if (state.networkState == NetworkState.NO_INTERNET) {
                val text = getString(R.string.conduit_service_no_internet_notification_text)
                Triple(R.drawable.ic_conduit_no_internet, text, text)
            } else {
                val transferBytes = (stats.totalBytesUp + stats.totalBytesDown).toLong()
                val prettyData = Formatter.formatFileSize(this, transferBytes)
                val shortText = getString(
                    R.string.conduit_service_running_notification_short_text,
                    stats.currentConnectedClients,
                    stats.currentConnectingClients,
                    prettyData,
                )
                val longText = getString(
                    R.string.conduit_service_running_notification_long_text,
                    stats.currentConnectedClients,
                    stats.currentConnectingClients,
                    prettyData,
                )
                Triple(R.drawable.ic_conduit_active, shortText, longText)
            }

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(notificationIconId)
            .setContentTitle(appName())
            .setContentText(shortText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(longText))
            .setOngoing(true)
            .addAction(
                R.drawable.ic_conduit_stop_service,
                getString(R.string.conduit_service_stop_label_text),
                stopPendingIntent,
            )
            .build()
    }

    private fun updateNotification() {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        manager.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun sendServiceStartingBroadcast() {
        val intent = Intent(SERVICE_STARTING_BROADCAST_INTENT)
        sendBroadcast(intent, SERVICE_STARTING_BROADCAST_PERMISSION)
    }

    override fun getContext(): Context {
        return this
    }

    override fun getPsiphonConfig(): String {
        val params = InproxyParameters.load(applicationContext)
            ?: throw IllegalStateException("No inproxy parameters available")

        val psiphonConfigString = try {
            Utils.readRawResourceFileAsString(applicationContext, R.raw.android_psiphon_config)
        } catch (e: IOException) {
            throw IllegalStateException("Failed to read Psiphon config", e)
        } catch (e: Resources.NotFoundException) {
            throw IllegalStateException("Missing android_psiphon_config", e)
        }

        try {
            val psiphonConfig = JSONObject(psiphonConfigString)
            psiphonConfig.put("InproxyEnableProxy", true)
            psiphonConfig.put("DisableTunnels", true)
            psiphonConfig.put("DisableLocalHTTPProxy", true)
            psiphonConfig.put("DisableLocalSocksProxy", true)
            psiphonConfig.put("EmitBytesTransferred", false)
            psiphonConfig.put("EmitInproxyProxyActivity", true)

            val packageInfo = packageManager.getPackageInfo(packageName, 0)
            val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.longVersionCode.toString()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode.toString()
            }
            psiphonConfig.put("ClientVersion", versionCode)
            psiphonConfig.put("DataRootDirectory", Utils.dataRootDirectory(applicationContext).absolutePath)
            psiphonConfig.put(
                "UseNoticeFiles",
                JSONObject()
                    .put("RotatingFileSize", Constants.HALF_MB)
                    .put("RotatingSyncFrequency", 0),
            )

            psiphonConfig.put("InproxyProxySessionPrivateKey", params.privateKey)
            psiphonConfig.put("InproxyMaxCommonClients", params.maxClients)
            psiphonConfig.put("InproxyMaxPersonalClients", params.maxPersonalClients)
            if (!params.personalCompartmentId.isNullOrBlank()) {
                psiphonConfig.put(
                    "InproxyProxyPersonalCompartmentID",
                    params.personalCompartmentId,
                )
            }
            psiphonConfig.put("InproxyLimitUpstreamBytesPerSecond", params.limitUpstreamBytesPerSecond)
            psiphonConfig.put("InproxyLimitDownstreamBytesPerSecond", params.limitDownstreamBytesPerSecond)

            Log.i(
                tag,
                "Inproxy config EmitInproxyProxyActivity=true maxCommonClients=${params.maxClients} maxPersonalClients=${params.maxPersonalClients} personalCompartmentPreview=${previewCompartmentId(params.personalCompartmentId)} upLimit=${params.limitUpstreamBytesPerSecond} downLimit=${params.limitDownstreamBytesPerSecond}",
            )

            if (
                params.reducedStartTime != null
                && params.reducedEndTime != null
                && params.reducedMaxClients != null
                && params.reducedLimitUpstreamBytesPerSecond != null
                && params.reducedLimitDownstreamBytesPerSecond != null
            ) {
                psiphonConfig.put("InproxyReducedStartTime", params.reducedStartTime)
                psiphonConfig.put("InproxyReducedEndTime", params.reducedEndTime)
                psiphonConfig.put("InproxyReducedMaxClients", params.reducedMaxClients)
                psiphonConfig.put("InproxyReducedLimitUpstreamBytesPerSecond", params.reducedLimitUpstreamBytesPerSecond)
                psiphonConfig.put("InproxyReducedLimitDownstreamBytesPerSecond", params.reducedLimitDownstreamBytesPerSecond)
            }

            return psiphonConfig.toString()
        } catch (e: PackageManager.NameNotFoundException) {
            throw IllegalStateException("Failed to get package info", e)
        } catch (e: Exception) {
            throw IllegalStateException("Failed to parse Psiphon config", e)
        }
    }

    override fun onInproxyProxyActivity(
        announcing: Int,
        connectingClients: Int,
        connectedClients: Int,
        bytesUp: Long,
        bytesDown: Long,
        personalRegionActivity: Map<String, ca.psiphon.PsiphonTunnel.RegionActivitySnapshot>,
        commonRegionActivity: Map<String, ca.psiphon.PsiphonTunnel.RegionActivitySnapshot>,
    ) {
        activityCallbackCount += 1
        Log.i(
            tag,
            "onInproxyProxyActivity #$activityCallbackCount announcing=$announcing connecting=$connectingClients connected=$connectedClients up=$bytesUp down=$bytesDown",
        )

        val snapshot = synchronized(statsLock) {
            val personalSnapshot = parseRegionActivity(personalRegionActivity)
            val commonSnapshot = parseRegionActivity(commonRegionActivity)
            val derivedCommonConnecting = maxOf(0, connectingClients - personalSnapshot.connectingClients)
            val derivedCommonConnected = maxOf(0, connectedClients - personalSnapshot.connectedClients)
            val derivedCommonBytesUp = maxOf(0L, bytesUp - personalSnapshot.bytesUp)
            val derivedCommonBytesDown = maxOf(0L, bytesDown - personalSnapshot.bytesDown)
            val useDerivedCommonSplit =
                commonRegionActivity.isEmpty() &&
                    commonSnapshot.connectingClients == 0 &&
                    commonSnapshot.connectedClients == 0 &&
                    commonSnapshot.bytesUp == 0L &&
                    commonSnapshot.bytesDown == 0L
            val commonConnecting = if (useDerivedCommonSplit) derivedCommonConnecting else commonSnapshot.connectingClients
            val commonConnected = if (useDerivedCommonSplit) derivedCommonConnected else commonSnapshot.connectedClients
            val commonBytesUp = if (useDerivedCommonSplit) derivedCommonBytesUp else commonSnapshot.bytesUp
            val commonBytesDown = if (useDerivedCommonSplit) derivedCommonBytesDown else commonSnapshot.bytesDown

            latestAnnouncingWorkers = announcing
            latestConnectingClients = connectingClients
            latestConnectedClients = connectedClients
            latestPersonalConnectingClients = personalSnapshot.connectingClients
            latestPersonalConnectedClients = personalSnapshot.connectedClients
            latestCommonConnectingClients = commonConnecting
            latestCommonConnectedClients = commonConnected
            latestPersonalRegionActivity = personalSnapshot.regionActivity
            latestCommonRegionActivity = commonSnapshot.regionActivity

            val timestampMs = System.currentTimeMillis()
            personalRegionalAccumulator.ingest(latestPersonalRegionActivity, timestampMs)
            commonRegionalAccumulator.ingest(latestCommonRegionActivity, timestampMs)
            regionalAccumulatorDirty = true

            proxyActivityStats.add(
                bytesUp,
                bytesDown,
                announcing,
                connectingClients,
                connectedClients,
            )
            personalProxyActivityStats.add(
                personalSnapshot.bytesUp,
                personalSnapshot.bytesDown,
                0,
                personalSnapshot.connectingClients,
                personalSnapshot.connectedClients,
            )
            commonProxyActivityStats.add(
                commonBytesUp,
                commonBytesDown,
                0,
                commonConnecting,
                commonConnected,
            )
            statsPersistenceDirty = true

            snapshotFromProxyActivityStats(
                totalSource = proxyActivityStats,
                personalSource = personalProxyActivityStats,
                commonSource = commonProxyActivityStats,
                personalRegionActivity = latestPersonalRegionActivity,
                commonRegionActivity = latestCommonRegionActivity,
            )
        }

        stats = snapshot
        latestStats = snapshot
        maybeEmitActivityStats(snapshot, force = false)
        updateNotification()
        maybePersistRegionalAccumulators(force = false)
    }

    override fun onInproxyMustUpgrade() {
        reportProxyError(
            action = "inProxyMustUpgrade",
            message = "Psiphon core requires an app upgrade",
            notificationTextResId = R.string.notification_conduit_inproxy_must_upgrade_text,
        )
        stopInproxy("must upgrade")
    }

    override fun onStartedWaitingForNetworkConnectivity() {
        state = state.copy(networkState = NetworkState.NO_INTERNET)
        latestProxyState = state
        publishProxyState(state)
        updateNotification()
    }

    override fun onStoppedWaitingForNetworkConnectivity() {
        state = state.copy(networkState = NetworkState.HAS_INTERNET)
        latestProxyState = state
        publishProxyState(state)
        updateNotification()
    }

    override fun onConnected() {
        state = ProxyState(Status.RUNNING, NetworkState.HAS_INTERNET)
        latestProxyState = state
        publishProxyState(state)
    }

    override fun onConnecting() {
        state = ProxyState(Status.RUNNING, NetworkState.HAS_INTERNET)
        latestProxyState = state
        publishProxyState(state)
    }

    override fun onListeningSocksProxyPort(port: Int) {
        // In in-proxy station mode local SOCKS is disabled by config.
    }

    override fun onSocksProxyPortInUse(port: Int) {
        reportProxyError(
            action = "inProxyStartFailed",
            message = "SOCKS proxy port in use: $port",
            notificationTextResId = R.string.notification_conduit_failed_to_start_text,
        )
    }

    private fun publishProxyState(nextState: ProxyState) {
        emitProxyState(applicationContext, nextState)
        notifyClientsProxyState(nextState)
    }

    private fun publishActivityStats(nextStats: ActivityStats) {
        emitActivityStats(applicationContext, nextStats)
        notifyClientsActivityStats(nextStats)
    }

    private fun maybeEmitActivityStats(nextStats: ActivityStats, force: Boolean) {
        val nowMs = System.currentTimeMillis()
        if (!force && nowMs - lastActivityStatsEmitMs < ACTIVITY_STATS_EMIT_INTERVAL_MS) {
            return
        }
        lastActivityStatsEmitMs = nowMs
        publishActivityStats(nextStats)
    }

    private fun notifyClientsProxyState(nextState: ProxyState) {
        val payload = proxyStateBundle(nextState)
        synchronized(clientsLock) {
            val deadClients = mutableListOf<IBinder>()
            clients.forEach { (clientBinder, client) ->
                try {
                    client.onProxyStateUpdated(payload)
                } catch (error: RemoteException) {
                    if (error is DeadObjectException) {
                        deadClients.add(clientBinder)
                    } else {
                        Log.e(tag, "Failed to notify proxy state", error)
                    }
                }
            }
            deadClients.forEach { clients.remove(it) }
        }
    }

    private fun notifyClientsActivityStats(nextStats: ActivityStats) {
        val payload = activityStatsBundle(nextStats)
        synchronized(clientsLock) {
            val deadClients = mutableListOf<IBinder>()
            clients.forEach { (clientBinder, client) ->
                try {
                    client.onProxyActivityStatsUpdated(payload)
                } catch (error: RemoteException) {
                    if (error is DeadObjectException) {
                        deadClients.add(clientBinder)
                    } else {
                        Log.e(tag, "Failed to notify proxy activity stats", error)
                    }
                }
            }
            deadClients.forEach { clients.remove(it) }
        }
    }

    private fun reportProxyError(action: String, message: String?, notificationTextResId: Int) {
        emitProxyError(applicationContext, action, message)
        persistPendingProxyError(action, message)
        deliverProxyErrorIntent(action, message, notificationTextResId)
    }

    private fun persistPendingProxyError(action: String, message: String?) {
        try {
            Utils.writeAtomicJson(
                File(applicationContext.filesDir, PENDING_PROXY_ERROR_FILE),
                JSONObject().apply {
                    put(KEY_PENDING_ERROR_ACTION, action)
                    if (!message.isNullOrBlank()) {
                        put(KEY_PENDING_ERROR_MESSAGE, message)
                    }
                },
            )
            getSharedPreferences(LEGACY_PENDING_PROXY_ERROR_PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_PENDING_ERROR_ACTION)
                .remove(KEY_PENDING_ERROR_MESSAGE)
                .apply()
        } catch (error: IOException) {
            Log.w(tag, "Failed to persist pending proxy error", error)
        }
    }

    private fun deliverProxyErrorIntent(action: String, message: String?, notificationTextResId: Int) {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            this.action = action
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            if (!message.isNullOrBlank()) {
                putExtra("errorMessage", message)
            }
        } ?: return

        val pendingIntent = PendingIntent.getActivity(
            applicationContext,
            action.hashCode(),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        try {
            pendingIntent.send()
        } catch (_: PendingIntent.CanceledException) {
            // Ignore and fall through to a visible notification.
        } catch (_: ActivityNotFoundException) {
            // Ignore and fall through to a visible notification.
        }

        val notificationText = getString(notificationTextResId)
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_conduit_error)
            .setContentTitle(appName())
            .setContentText(notificationText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(notificationText))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        val notificationId = 19000 + (action.hashCode().absoluteValue % 1000)
        manager.notify(notificationId, notification)
    }

    private fun appName(): String {
        return applicationInfo.loadLabel(packageManager).toString()
    }

    private fun previewCompartmentId(value: String?): String {
        if (value.isNullOrBlank()) {
            return "<none>"
        }
        return if (value.length <= 16) {
            value
        } else {
            "${value.take(8)}...${value.takeLast(8)}"
        }
    }

    override fun onApplicationParameters(`object`: Any?) {
        val params = `object` as? JSONObject ?: return
        val trustedSignatures = PackageHelper.parseTrustedAppsFromApplicationParameters(params)
        PackageHelper.saveTrustedSignaturesToFile(applicationContext, trustedSignatures)
        PackageHelper.configureRuntimeTrustedSignatures(trustedSignatures)
        Log.i(tag, "Updated runtime trusted signatures for ${trustedSignatures.size} package(s)")
    }
}
