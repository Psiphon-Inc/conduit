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
import java.util.concurrent.Future
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
        const val SERVICE_STARTING_BROADCAST_INTENT =
            "ca.psiphon.conduit.nativemodule.SERVICE_STARTING_BROADCAST_INTENT"
        const val SERVICE_STARTING_BROADCAST_PERMISSION =
            "ca.psiphon.conduit.nativemodule.SERVICE_STARTING_BROADCAST_PERMISSION"

        private const val NOTIFICATION_CHANNEL_ID = "PsiphonTunnelCoreInproxyChannel"
        private const val NOTIFICATION_ID = 18489
        private const val ACTIVITY_NUM_BUCKETS_1000MS = ProxyActivityStats.MAX_BUCKETS_1000MS
        private const val ACTIVITY_NUM_BUCKETS_3600000MS = ProxyActivityStats.MAX_BUCKETS_3600000MS
        private const val REGIONAL_ACCUMULATOR_PERSIST_VERSION = 3
        private const val REGIONAL_ACCUMULATOR_PERSIST_VERSION_V2 = 2
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

        private fun proxyErrorBundle(action: String, message: String?): android.os.Bundle {
            return android.os.Bundle().apply {
                putString("action", action)
                putString("message", message)
            }
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
    }

    private val tag = "InproxyForegroundService"
    private val psiphonTunnel: PsiphonTunnel = PsiphonTunnel.newPsiphonTunnel(this)
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val tunnelStopExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val isRunning = AtomicBoolean(false)
    private val tunnelStopRequested = AtomicBoolean(false)
    private val clients = ConcurrentHashMap<IBinder, IConduitClientCallback>()
    private val clientsLock = Any()
    private val statsLock = Any()
    @Volatile
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
    private val totalHourlyActivityAccumulator = HourlyActivityAccumulator()
    private val personalHourlyActivityAccumulator = HourlyActivityAccumulator()
    private val commonHourlyActivityAccumulator = HourlyActivityAccumulator()
    private var regionalAccumulatorDirty = false
    private var statsPersistenceDirty = false
    private var lastRegionalAccumulatorPersistMs = 0L
    private var lastActivityStatsEmitMs = 0L
    @Volatile
    private var regionalAccumulatorLoadFuture: Future<*>? = null
    @Volatile
    private var notificationChannelReady = false
    @Volatile
    private var cachedAppName: String? = null

    private fun logInfo(message: String) {
        AppLogStore.info(applicationContext, tag, message)
    }

    private fun logWarn(message: String) {
        AppLogStore.warn(applicationContext, tag, message)
    }

    private fun logWarn(message: String, error: Throwable) {
        AppLogStore.warn(applicationContext, tag, message, error)
    }

    private fun logError(message: String) {
        AppLogStore.error(applicationContext, tag, message)
    }

    private fun logError(message: String, error: Throwable) {
        AppLogStore.error(applicationContext, tag, message, error)
    }

    private val binder = object : IConduitService.Stub() {
        override fun registerClient(client: IConduitClientCallback?) {
            if (client == null) {
                return
            }
            synchronized(clientsLock) {
                val clientBinder = client.asBinder()
                clients[clientBinder] = client
                logInfo("Client registered, total=${clients.size}")
                try {
                    client.onProxyStateUpdated(proxyStateBundle(state))
                } catch (error: RemoteException) {
                    logError("Failed to send proxy state update to client", error)
                }
                try {
                    client.onProxyActivityStatsUpdated(activityStatsBundle(stats))
                } catch (error: RemoteException) {
                    logError("Failed to send proxy activity stats update to client", error)
                }
            }
        }

        override fun unregisterClient(client: IConduitClientCallback?) {
            if (client == null) {
                return
            }
            synchronized(clientsLock) {
                clients.remove(client.asBinder())
                logInfo("Client unregistered, total=${clients.size}")
            }
        }

        override fun consumePendingProxyError(): android.os.Bundle {
            val pendingError = loadPendingProxyError(applicationContext) ?: return android.os.Bundle()
            clearPendingProxyError(applicationContext)
            return proxyErrorBundle(pendingError.action, pendingError.message)
        }
    }

    override fun onBind(intent: Intent?): IBinder? {
        return binder
    }

    override fun onCreate() {
        super.onCreate()
        logInfo("Inproxy foreground service created")
        regionalAccumulatorLoadFuture = executor.submit {
            loadRegionalAccumulatorsFromDisk()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == null) {
            logWarn("Received start command without action")
            return START_NOT_STICKY
        }
        val started = when (action) {
            ACTION_TOGGLE_INPROXY -> handleToggle(intent)
            ACTION_PARAMS_CHANGED -> {
                handleParamsChanged(intent)
                false
            }
            ACTION_STOP_INPROXY -> {
                stopInproxy("manual stop")
                false
            }
            ACTION_START_INPROXY_WITH_LAST_PARAMS -> handleStartWithLastParams()
            else -> {
                logWarn("Unknown action: $action")
                false
            }
        }
        if (!isRunning.get()) {
            stopSelf(startId)
        }
        return if (started) START_REDELIVER_INTENT else START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        logInfo("Inproxy foreground service destroyed")
        waitForRegionalAccumulatorLoad()
        maybePersistRegionalAccumulators(force = true)
        stopActivityEmitter()
        executor.shutdownNow()
        tunnelStopExecutor.shutdownNow()
        synchronized(clientsLock) {
            clients.clear()
        }
    }

    private fun handleToggle(intent: Intent): Boolean {
        logInfo("Received toggle action")
        if (isRunning.get()) {
            logInfo("Service is running; toggling off")
            stopInproxy("toggle stop")
            return false
        }
        logInfo("Service is not running; starting with new parameters")
        val params = InproxyParameters.fromIntent(intent)
        if (params == null) {
            logError("Attempted to start inproxy with invalid parameters")
            reportProxyError(
                action = "inProxyStartFailed",
                message = "Invalid inproxy parameters",
                notificationTextResId = R.string.notification_conduit_failed_to_start_text,
            )
            return false
        }
        params.store(applicationContext)
        return startInproxy(params)
    }

    private fun handleParamsChanged(intent: Intent) {
        val params = InproxyParameters.fromIntent(intent)
        if (params == null) {
            logError("Attempted to update inproxy parameters with invalid parameters")
            reportProxyError(
                action = "inProxyRestartFailed",
                message = "Invalid inproxy parameters",
                notificationTextResId = R.string.notification_conduit_failed_to_restart_text,
            )
            return
        }
        val changed = params.store(applicationContext)
        if (!changed) {
            logInfo("Parameters update called, but no changes detected")
            return
        }
        logInfo("Parameters updated; changes persisted")
        if (isRunning.get()) {
            logInfo("Service is running; restarting inproxy tunnel due to parameter changes")
            try {
                resetStats()
                psiphonTunnel.restartPsiphon()
            } catch (e: Exception) {
                logError("Failed to restart in-proxy tunnel", e)
                reportProxyError(
                    action = "inProxyRestartFailed",
                    message = e.message,
                    notificationTextResId = R.string.notification_conduit_failed_to_restart_text,
                )
                stopInproxy("restart failed")
            }
        } else {
            logInfo("Service is stopped; updated parameters will apply on next start")
        }
    }

    private fun handleStartWithLastParams(): Boolean {
        if (isRunning.get()) {
            logInfo("Service is already running; ignoring start with last parameters action")
            return false
        }
        logInfo("Service is stopped; starting with last known parameters")
        val params = InproxyParameters.load(applicationContext)
        if (params == null) {
            logWarn("No persisted inproxy parameters available")
            return false
        }
        return startInproxy(params)
    }

    private fun startInproxy(params: InproxyParameters): Boolean {
        if (!isRunning.compareAndSet(false, true)) {
            logInfo("Service is not stopped; cannot start")
            return false
        }
        logInfo("Starting inproxy")
        sendBroadcast(
            Intent(SERVICE_STARTING_BROADCAST_INTENT),
            SERVICE_STARTING_BROADCAST_PERMISSION,
        )
        tunnelStopRequested.set(false)

        Utils.setServiceRunningFlag(applicationContext, true)
        state = ProxyState(Status.RUNNING, NetworkState.HAS_INTERNET)
        latestProxyState = state

        if (!startForegroundSafely()) {
            logError("Unable to start inproxy because the foreground notification is unavailable")
            isRunning.set(false)
            stopActivityEmitter()
            Utils.setServiceRunningFlag(applicationContext, false)
            state = ProxyState(Status.STOPPED, null)
            latestProxyState = state
            publishProxyState(state)
            stopSelf()
            return false
        }

        waitForRegionalAccumulatorLoad()
        resetStats()
        startActivityEmitter()
        publishProxyState(state)
        updateNotification()

        val latch = CountDownLatch(1)
        stopLatch = latch
        executor.submit {
            try {
                logInfo("Inproxy task started")
                psiphonTunnel.startTunneling(Utils.getEmbeddedServers(this))
                latch.await()
                logInfo("Inproxy task stopping")
            } catch (e: PsiphonTunnel.Exception) {
                logError("Failed to start inproxy", e)
                reportProxyError(
                    action = "inProxyStartFailed",
                    message = e.message,
                    notificationTextResId = R.string.notification_conduit_failed_to_start_text,
                )
            } catch (e: InterruptedException) {
                logWarn("Inproxy task interrupted", e)
                Thread.currentThread().interrupt()
            } finally {
                stopTunnelOnce("worker cleanup")
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
                logInfo("Inproxy task stopped")
                stopSelf()
            }
        }
        return true
    }

    private fun stopInproxy(reason: String) {
        if (!isRunning.get()) {
            logInfo("Service is not running; cannot stop: $reason")
            return
        }
        logInfo("Stopping inproxy: $reason")
        if (!claimTunnelStop("stop requested: $reason")) {
            return
        }
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
        Utils.setServiceRunningFlag(applicationContext, false)
        stopLatch?.countDown()
        val stoppedStats = latestStats
        tunnelStopExecutor.submit {
            stopTunnel()
            maybeEmitActivityStats(stoppedStats, force = true)
            maybePersistRegionalAccumulators(force = true)
        }
    }

    private fun stopTunnelOnce(reason: String) {
        if (!claimTunnelStop(reason)) {
            return
        }
        stopTunnel()
    }

    private fun claimTunnelStop(reason: String): Boolean {
        if (tunnelStopRequested.compareAndSet(false, true)) {
            return true
        }
        logInfo("Tunnel stop already requested; skipping duplicate stop: $reason")
        return false
    }

    private fun stopTunnel() {
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
            val timestampMs = System.currentTimeMillis()
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
            totalHourlyActivityAccumulator.ingest(
                0,
                0,
                latestAnnouncingWorkers,
                latestConnectingClients,
                latestConnectedClients,
                timestampMs,
            )
            personalHourlyActivityAccumulator.ingest(
                0,
                0,
                0,
                latestPersonalConnectingClients,
                latestPersonalConnectedClients,
                timestampMs,
            )
            commonHourlyActivityAccumulator.ingest(
                0,
                0,
                0,
                latestCommonConnectingClients,
                latestCommonConnectedClients,
                timestampMs,
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
        val nowMs = System.currentTimeMillis()
        val totalSegment = segmentFromProxyActivityStats(
            totalSource,
            totalHourlyActivityAccumulator.toPeriodSnapshot(nowMs = nowMs),
        )
        val personalSegment = segmentFromProxyActivityStats(
            personalSource,
            personalHourlyActivityAccumulator.toPeriodSnapshot(nowMs = nowMs),
        )
        val commonSegment = segmentFromProxyActivityStats(
            commonSource,
            commonHourlyActivityAccumulator.toPeriodSnapshot(nowMs = nowMs),
        )
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
            totalBytesUp = totalSegment.totalBytesUp,
            totalBytesDown = totalSegment.totalBytesDown,
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

    private fun segmentFromProxyActivityStats(
        source: ProxyActivityStats,
        hourlyOverride: HourlyActivityPeriodSnapshot?,
    ): SegmentStats {
        return SegmentStats(
            totalBytesUp = maxOf(
                source.totalBytesUp,
                hourlyOverride?.totalBytesUp ?: 0L,
            ).toDouble(),
            totalBytesDown = maxOf(
                source.totalBytesDown,
                hourlyOverride?.totalBytesDown ?: 0L,
            ).toDouble(),
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
            hourlyBytesUpSeries = hourlyOverride?.bytesUpSeries
                ?: source.getBytesUpSeries(ProxyActivityStats.BUCKET_COLLECTION_3600000MS)
                    .map { it.toDouble() },
            hourlyBytesDownSeries = hourlyOverride?.bytesDownSeries
                ?: source.getBytesDownSeries(ProxyActivityStats.BUCKET_COLLECTION_3600000MS)
                    .map { it.toDouble() },
            hourlyAnnouncingWorkersSeries = hourlyOverride?.announcingWorkersSeries
                ?: source.getAnnouncingWorkersSeries(ProxyActivityStats.BUCKET_COLLECTION_3600000MS)
                    .map { it.toInt() },
            hourlyConnectingClientsSeries = hourlyOverride?.connectingClientsSeries
                ?: source.getConnectingClientsSeries(ProxyActivityStats.BUCKET_COLLECTION_3600000MS)
                    .map { it.toInt() },
            hourlyConnectedClientsSeries = hourlyOverride?.connectedClientsSeries
                ?: source.getConnectedClientsSeries(ProxyActivityStats.BUCKET_COLLECTION_3600000MS)
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
                    payloadVersion != REGIONAL_ACCUMULATOR_PERSIST_VERSION_V2 &&
                    payloadVersion != REGIONAL_ACCUMULATOR_PERSIST_VERSION_V1
            ) {
                logWarn("Ignoring regional accumulator payload version=$payloadVersion")
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
                    totalHourlyActivityAccumulator.restoreFromPersistedJson(
                        payload.optJSONObject("totalHourlyActivity"),
                    )
                    personalHourlyActivityAccumulator.restoreFromPersistedJson(
                        payload.optJSONObject("personalHourlyActivity"),
                    )
                    commonHourlyActivityAccumulator.restoreFromPersistedJson(
                        payload.optJSONObject("commonHourlyActivity"),
                    )
                }

                if (payloadVersion >= REGIONAL_ACCUMULATOR_PERSIST_VERSION_V2) {
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
                            if (payloadVersion < REGIONAL_ACCUMULATOR_PERSIST_VERSION) {
                                val nowMs = System.currentTimeMillis()
                                totalHourlyActivityAccumulator.restoreFromProxyActivityStats(
                                    restoredTotal,
                                    nowMs,
                                )
                                personalHourlyActivityAccumulator.restoreFromProxyActivityStats(
                                    restoredPersonal,
                                    nowMs,
                                )
                                commonHourlyActivityAccumulator.restoreFromProxyActivityStats(
                                    restoredCommon,
                                    nowMs,
                                )
                            }
                        }
                    } else {
                        logInfo("Skipping proxy activity restore due to boot epoch mismatch")
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
            logInfo("Loaded persisted regional breakdown state")
        } catch (e: Exception) {
            logWarn("Failed to load persisted regional breakdown state", e)
        }
    }

    private fun waitForRegionalAccumulatorLoad() {
        val future = regionalAccumulatorLoadFuture ?: return
        try {
            future.get()
        } catch (error: InterruptedException) {
            Thread.currentThread().interrupt()
            logWarn("Interrupted while waiting for regional breakdown state load", error)
        } catch (error: Exception) {
            logWarn("Failed waiting for regional breakdown state load", error)
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
                .put("totalHourlyActivity", totalHourlyActivityAccumulator.toPersistedJson())
                .put("personalHourlyActivity", personalHourlyActivityAccumulator.toPersistedJson())
                .put("commonHourlyActivity", commonHourlyActivityAccumulator.toPersistedJson())
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
            logWarn("Failed to persist regional breakdown state", e)
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
            logWarn("Failed to marshal proxy activity stats", e)
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
            logWarn("Failed to unmarshal proxy activity stats", e)
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

    private data class HourlyActivityPeriodSnapshot(
        val totalBytesUp: Long,
        val totalBytesDown: Long,
        val bytesUpSeries: List<Double>,
        val bytesDownSeries: List<Double>,
        val announcingWorkersSeries: List<Int>,
        val connectingClientsSeries: List<Int>,
        val connectedClientsSeries: List<Int>,
    )

    private data class HourlyActivityBucket(
        val hourStartMs: Long,
        var bytesUp: Long,
        var bytesDown: Long,
        var announcingWorkers: Int,
        var connectingClients: Int,
        var connectedClients: Int,
    )

    private class HourlyActivityAccumulator {
        private val buckets = mutableListOf<HourlyActivityBucket>()

        fun ingest(
            bytesUp: Long,
            bytesDown: Long,
            announcingWorkers: Int,
            connectingClients: Int,
            connectedClients: Int,
            timestampMs: Long,
        ) {
            val bucket = ensureBucket(hourStartMs(timestampMs))
            bucket.bytesUp += maxOf(0L, bytesUp)
            bucket.bytesDown += maxOf(0L, bytesDown)
            bucket.announcingWorkers = maxOf(bucket.announcingWorkers, announcingWorkers)
            bucket.connectingClients = maxOf(bucket.connectingClients, connectingClients)
            bucket.connectedClients = maxOf(bucket.connectedClients, connectedClients)
        }

        fun toPeriodSnapshot(
            hours: Int = ACTIVITY_NUM_BUCKETS_3600000MS,
            nowMs: Long = System.currentTimeMillis(),
        ): HourlyActivityPeriodSnapshot? {
            if (hours <= 0 || buckets.isEmpty()) {
                return null
            }

            val hourMs = TimeUnit.HOURS.toMillis(1)
            val latestHourStartMs = hourStartMs(nowMs)
            val firstHourStartMs = latestHourStartMs - (hours - 1) * hourMs
            val bucketsByHour = buckets.associateBy { bucket -> bucket.hourStartMs }
            val bytesUpSeries = ArrayList<Double>(hours)
            val bytesDownSeries = ArrayList<Double>(hours)
            val announcingWorkersSeries = ArrayList<Int>(hours)
            val connectingClientsSeries = ArrayList<Int>(hours)
            val connectedClientsSeries = ArrayList<Int>(hours)
            var totalBytesUp = 0L
            var totalBytesDown = 0L

            for (index in 0 until hours) {
                val bucket = bucketsByHour[firstHourStartMs + index * hourMs]
                if (bucket == null) {
                    bytesUpSeries.add(0.0)
                    bytesDownSeries.add(0.0)
                    announcingWorkersSeries.add(0)
                    connectingClientsSeries.add(0)
                    connectedClientsSeries.add(0)
                } else {
                    totalBytesUp += bucket.bytesUp
                    totalBytesDown += bucket.bytesDown
                    bytesUpSeries.add(bucket.bytesUp.toDouble())
                    bytesDownSeries.add(bucket.bytesDown.toDouble())
                    announcingWorkersSeries.add(bucket.announcingWorkers)
                    connectingClientsSeries.add(bucket.connectingClients)
                    connectedClientsSeries.add(bucket.connectedClients)
                }
            }

            return HourlyActivityPeriodSnapshot(
                totalBytesUp = totalBytesUp,
                totalBytesDown = totalBytesDown,
                bytesUpSeries = bytesUpSeries,
                bytesDownSeries = bytesDownSeries,
                announcingWorkersSeries = announcingWorkersSeries,
                connectingClientsSeries = connectingClientsSeries,
                connectedClientsSeries = connectedClientsSeries,
            )
        }

        fun toPersistedJson(): JSONObject {
            val bucketsJson = JSONArray()
            for (bucket in buckets) {
                bucketsJson.put(
                    JSONObject()
                        .put("hourStartMs", bucket.hourStartMs)
                        .put("bytesUp", bucket.bytesUp)
                        .put("bytesDown", bucket.bytesDown)
                        .put("announcingWorkers", bucket.announcingWorkers)
                        .put("connectingClients", bucket.connectingClients)
                        .put("connectedClients", bucket.connectedClients),
                )
            }
            return JSONObject().put("buckets", bucketsJson)
        }

        fun restoreFromPersistedJson(json: JSONObject?) {
            buckets.clear()
            val bucketsJson = json?.optJSONArray("buckets") ?: JSONArray()
            for (index in 0 until bucketsJson.length()) {
                val bucketJson = bucketsJson.optJSONObject(index) ?: continue
                val hourStartMs = bucketJson.optLong("hourStartMs", Long.MIN_VALUE)
                if (hourStartMs == Long.MIN_VALUE) {
                    continue
                }
                buckets.add(
                    HourlyActivityBucket(
                        hourStartMs = hourStartMs,
                        bytesUp = maxOf(0L, bucketJson.optLong("bytesUp", 0L)),
                        bytesDown = maxOf(0L, bucketJson.optLong("bytesDown", 0L)),
                        announcingWorkers = maxOf(0, bucketJson.optInt("announcingWorkers", 0)),
                        connectingClients = maxOf(0, bucketJson.optInt("connectingClients", 0)),
                        connectedClients = maxOf(0, bucketJson.optInt("connectedClients", 0)),
                    ),
                )
            }
            buckets.sortBy { bucket -> bucket.hourStartMs }
            pruneOldBuckets()
        }

        fun restoreFromProxyActivityStats(source: ProxyActivityStats, nowMs: Long) {
            val bytesUpSeries = source.getBytesUpSeries(
                ProxyActivityStats.BUCKET_COLLECTION_3600000MS,
            )
            val bytesDownSeries = source.getBytesDownSeries(
                ProxyActivityStats.BUCKET_COLLECTION_3600000MS,
            )
            val announcingWorkersSeries = source.getAnnouncingWorkersSeries(
                ProxyActivityStats.BUCKET_COLLECTION_3600000MS,
            )
            val connectingClientsSeries = source.getConnectingClientsSeries(
                ProxyActivityStats.BUCKET_COLLECTION_3600000MS,
            )
            val connectedClientsSeries = source.getConnectedClientsSeries(
                ProxyActivityStats.BUCKET_COLLECTION_3600000MS,
            )
            val size = listOf(
                bytesUpSeries.size,
                bytesDownSeries.size,
                announcingWorkersSeries.size,
                connectingClientsSeries.size,
                connectedClientsSeries.size,
                ACTIVITY_NUM_BUCKETS_3600000MS,
            ).minOrNull() ?: return
            if (size <= 0) {
                return
            }

            buckets.clear()
            val hourMs = TimeUnit.HOURS.toMillis(1)
            val firstHourStartMs = hourStartMs(nowMs) - (size - 1) * hourMs
            for (index in 0 until size) {
                val bytesUp = maxOf(0L, bytesUpSeries[index])
                val bytesDown = maxOf(0L, bytesDownSeries[index])
                val announcingWorkers = maxOf(0, announcingWorkersSeries[index].toInt())
                val connectingClients = maxOf(0, connectingClientsSeries[index].toInt())
                val connectedClients = maxOf(0, connectedClientsSeries[index].toInt())
                if (
                    bytesUp == 0L &&
                        bytesDown == 0L &&
                        announcingWorkers == 0 &&
                        connectingClients == 0 &&
                        connectedClients == 0
                ) {
                    continue
                }
                buckets.add(
                    HourlyActivityBucket(
                        hourStartMs = firstHourStartMs + index * hourMs,
                        bytesUp = bytesUp,
                        bytesDown = bytesDown,
                        announcingWorkers = announcingWorkers,
                        connectingClients = connectingClients,
                        connectedClients = connectedClients,
                    ),
                )
            }
            pruneOldBuckets()
        }

        private fun ensureBucket(hourStartMs: Long): HourlyActivityBucket {
            val latest = buckets.lastOrNull()
            if (latest != null && latest.hourStartMs == hourStartMs) {
                return latest
            }

            buckets.firstOrNull { bucket -> bucket.hourStartMs == hourStartMs }?.let {
                return it
            }

            val created = HourlyActivityBucket(
                hourStartMs = hourStartMs,
                bytesUp = 0,
                bytesDown = 0,
                announcingWorkers = 0,
                connectingClients = 0,
                connectedClients = 0,
            )
            buckets.add(created)
            buckets.sortBy { bucket -> bucket.hourStartMs }
            pruneOldBuckets()
            return created
        }

        private fun pruneOldBuckets() {
            while (buckets.size > ACTIVITY_NUM_BUCKETS_3600000MS) {
                buckets.removeAt(0)
            }
        }

        private fun hourStartMs(timestampMs: Long): Long {
            val hourMs = TimeUnit.HOURS.toMillis(1)
            return timestampMs - (timestampMs % hourMs)
        }
    }

    private class RegionalByteAccumulator {
        private val buckets = mutableListOf<RegionalHourBucket>()
        private var latestConnectedByRegion: Map<String, Int> = emptyMap()

        fun reset() {
            buckets.clear()
            latestConnectedByRegion = emptyMap()
        }

        fun ingest(snapshot: List<RegionActivity>, timestampMs: Long) {
            val bucket = ensureBucket(hourStartMs(timestampMs))

            for (activity in snapshot) {
                val delta = (activity.bytesUp + activity.bytesDown).toLong()
                if (delta > 0L) {
                    bucket.bytesByRegion[activity.region] =
                        (bucket.bytesByRegion[activity.region] ?: 0L) + delta
                }
            }

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

            latestConnectedByRegion = jsonToIntMap(json.optJSONObject("latestConnectedByRegion"))
        }

        fun toRegionActivity(hours: Int): List<RegionActivity> {
            if (hours <= 0 || buckets.isEmpty()) {
                return emptyList()
            }

            val latestHourStartMs = hourStartMs(System.currentTimeMillis())
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

        private fun hourStartMs(timestampMs: Long): Long {
            val hourMs = TimeUnit.HOURS.toMillis(1)
            return timestampMs - (timestampMs % hourMs)
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

    private fun ensureNotificationChannel(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return true
        }
        if (notificationChannelReady) {
            return true
        }
        val manager = getSystemService(NotificationManager::class.java) ?: return false
        return try {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                appName(),
                NotificationManager.IMPORTANCE_LOW,
            )
            channel.description = getString(R.string.conduit_service_channel_description)
            manager.createNotificationChannel(channel)
            val ready = manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID) != null
            notificationChannelReady = ready
            ready
        } catch (error: RuntimeException) {
            logError("Failed to create foreground notification channel", error)
            false
        }
    }

    private fun startForegroundSafely(): Boolean {
        if (!ensureNotificationChannel()) {
            return false
        }
        return try {
            startForeground(NOTIFICATION_ID, buildStartingNotification())
            true
        } catch (error: RuntimeException) {
            logError("Failed to start foreground notification", error)
            false
        }
    }

    private fun notificationBuilder(): NotificationCompat.Builder {
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_conduit_notification)
            .setContentTitle(appName())
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
    }

    private fun buildStartingNotification(): Notification {
        val text = getString(R.string.conduit_service_starting_notification_text)
        return notificationBuilder()
            .setContentText(text)
            .build()
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

        val (shortText, longText) =
            if (state.networkState == NetworkState.NO_INTERNET) {
                val text = getString(R.string.conduit_service_no_internet_notification_text)
                Pair(text, text)
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
                Pair(shortText, longText)
            }

        return notificationBuilder()
            .setContentText(shortText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(longText))
            .addAction(
                R.drawable.ic_conduit_stop_service,
                getString(R.string.conduit_service_stop_label_text),
                stopPendingIntent,
            )
            .build()
    }

    private fun updateNotification() {
        if (!ensureNotificationChannel()) {
            return
        }
        val manager = getSystemService(NotificationManager::class.java) ?: return
        try {
            manager.notify(NOTIFICATION_ID, buildNotification())
        } catch (error: RuntimeException) {
            logError("Failed to update foreground notification", error)
        }
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

            logInfo(
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
        logInfo(
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

            totalHourlyActivityAccumulator.ingest(
                bytesUp,
                bytesDown,
                announcing,
                connectingClients,
                connectedClients,
                timestampMs,
            )
            personalHourlyActivityAccumulator.ingest(
                personalSnapshot.bytesUp,
                personalSnapshot.bytesDown,
                0,
                personalSnapshot.connectingClients,
                personalSnapshot.connectedClients,
                timestampMs,
            )
            commonHourlyActivityAccumulator.ingest(
                commonBytesUp,
                commonBytesDown,
                0,
                commonConnecting,
                commonConnected,
                timestampMs,
            )

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
        logWarn("Inproxy must upgrade")
        reportProxyError(
            action = "inProxyMustUpgrade",
            message = "Psiphon core requires an app upgrade",
            notificationTextResId = R.string.notification_conduit_inproxy_must_upgrade_text,
        )
        stopInproxy("must upgrade")
    }

    override fun onStartedWaitingForNetworkConnectivity() {
        logInfo("Started waiting for network connectivity")
        state = state.copy(networkState = NetworkState.NO_INTERNET)
        latestProxyState = state
        publishProxyState(state)
        updateNotification()
    }

    override fun onStoppedWaitingForNetworkConnectivity() {
        logInfo("Stopped waiting for network connectivity")
        state = state.copy(networkState = NetworkState.HAS_INTERNET)
        latestProxyState = state
        publishProxyState(state)
        updateNotification()
    }

    override fun onConnected() {
        logInfo("Inproxy connected")
        state = ProxyState(Status.RUNNING, NetworkState.HAS_INTERNET)
        latestProxyState = state
        publishProxyState(state)
    }

    override fun onConnecting() {
        logInfo("Inproxy connecting")
        state = ProxyState(Status.RUNNING, NetworkState.HAS_INTERNET)
        latestProxyState = state
        publishProxyState(state)
    }

    override fun onListeningSocksProxyPort(port: Int) {
        // In in-proxy station mode local SOCKS is disabled by config.
    }

    override fun onSocksProxyPortInUse(port: Int) {
        logError("SOCKS proxy port in use: $port")
        reportProxyError(
            action = "inProxyStartFailed",
            message = "SOCKS proxy port in use: $port",
            notificationTextResId = R.string.notification_conduit_failed_to_start_text,
        )
    }

    private fun publishProxyState(nextState: ProxyState) {
        notifyClientsProxyState(nextState)
    }

    private fun maybeEmitActivityStats(nextStats: ActivityStats, force: Boolean) {
        val nowMs = System.currentTimeMillis()
        if (!force && nowMs - lastActivityStatsEmitMs < ACTIVITY_STATS_EMIT_INTERVAL_MS) {
            return
        }
        lastActivityStatsEmitMs = nowMs
        notifyClientsActivityStats(nextStats)
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
                        logError("Failed to notify proxy state", error)
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
                        logError("Failed to notify proxy activity stats", error)
                    }
                }
            }
            deadClients.forEach { clients.remove(it) }
        }
    }

    private fun notifyClientsProxyError(action: String, message: String?) {
        val payload = proxyErrorBundle(action, message)
        synchronized(clientsLock) {
            val deadClients = mutableListOf<IBinder>()
            clients.forEach { (clientBinder, client) ->
                try {
                    client.onProxyError(payload)
                } catch (error: RemoteException) {
                    if (error is DeadObjectException) {
                        deadClients.add(clientBinder)
                    } else {
                        logError("Failed to notify proxy error", error)
                    }
                }
            }
            deadClients.forEach { clients.remove(it) }
        }
    }

    private fun reportProxyError(action: String, message: String?, notificationTextResId: Int) {
        logWarn("Reporting proxy error action=$action message=${message.orEmpty()}")
        notifyClientsProxyError(action, message)
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
            logWarn("Failed to persist pending proxy error", error)
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
        if (!ensureNotificationChannel()) {
            return
        }
        val notification = notificationBuilder()
            .setContentText(notificationText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(notificationText))
            .setOngoing(false)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        val notificationId = 19000 + (action.hashCode().absoluteValue % 1000)
        try {
            manager.notify(notificationId, notification)
        } catch (error: RuntimeException) {
            logError("Failed to show proxy error notification", error)
        }
    }

    private fun appName(): String {
        cachedAppName?.let { return it }
        return applicationInfo.loadLabel(packageManager).toString().also {
            cachedAppName = it
        }
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
        try {
            PackageHelper.saveTrustedSignaturesToFile(applicationContext, trustedSignatures)
        } catch (error: IOException) {
            logError("Failed to persist trusted signatures; using in-memory values only", error)
        }
        PackageHelper.configureRuntimeTrustedSignatures(trustedSignatures)
        logInfo("Updated runtime trusted signatures for ${trustedSignatures.size} package(s)")
    }
}
