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
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkInfo
import android.os.Build
import androidx.annotation.NonNull
import androidx.work.Data
import androidx.work.Worker
import androidx.work.WorkerParameters
import ca.psiphon.PsiphonTunnel
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import psi.Psi
import java.io.BufferedReader
import java.io.File
import java.io.FileReader
import java.io.IOException
import java.nio.channels.FileChannel
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.TreeMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class FeedbackWorker(@NonNull context: Context, @NonNull params: WorkerParameters) : Worker(context, params) {
    companion object {
        const val UNIQUE_WORK_NAME = "PsiphonTunnelCoreFeedbackUpload"
        const val INPUT_FEEDBACK_ID = "feedbackId"
        const val INPUT_FEEDBACK_TIMESTAMP = "feedbackTimestamp"
        const val INPUT_INPROXY_ID = "inproxyId"
        private const val TAG = "FeedbackWorker"
        private const val METADATA_VERSION = 2

        fun createInputData(inproxyId: String): Data {
            return Data.Builder()
                .putString(INPUT_FEEDBACK_ID, generateFeedbackId())
                .putLong(INPUT_FEEDBACK_TIMESTAMP, System.currentTimeMillis())
                .putString(INPUT_INPROXY_ID, inproxyId)
                .build()
        }

        fun createFeedbackSnapshot(@NonNull context: Context, @NonNull feedbackId: String) {
            val dir = feedbackDirectoryForContext(context)
            mergeFiles(
                File(dir, "app.$feedbackId.feedback"),
                AppLogStore.allLogFiles(context),
            )

            val noticeFiles = mutableListOf<File>()
            val dataRoot = Utils.dataRootDirectory(context).absolutePath
            val oldNotices = File(Psi.oldNoticesFilePath(dataRoot))
            if (oldNotices.exists()) {
                noticeFiles.add(oldNotices)
            }
            val notices = File(Psi.noticesFilePath(dataRoot))
            if (notices.exists()) {
                noticeFiles.add(notices)
            }

            mergeFiles(File(dir, "tunnelcore.$feedbackId.feedback"), noticeFiles)
        }

        fun cleanupOldFeedbackFiles(@NonNull context: Context, olderThanMillis: Long) {
            val dir = feedbackDirectoryForContext(context)
            dir.listFiles()?.forEach { file ->
                if (file.isFile && file.lastModified() < olderThanMillis) {
                    file.delete()
                }
            }
        }

        private fun generateFeedbackId(): String {
            val bytes = ByteArray(8)
            SecureRandom().nextBytes(bytes)
            return bytes.joinToString(separator = "") { b -> "%02x".format(b) }
        }

        private fun feedbackDirectoryForContext(context: Context): File {
            val dir = File(Utils.dataRootDirectory(context), "feedback")
            if (!dir.exists()) {
                dir.mkdirs()
            }
            return dir
        }

        private fun mergeFiles(outputFile: File, inputFiles: List<File>) {
            if (outputFile.exists()) {
                outputFile.delete()
            }
            if (inputFiles.isEmpty()) {
                return
            }

            FileChannel.open(
                outputFile.toPath(),
                java.nio.file.StandardOpenOption.CREATE,
                java.nio.file.StandardOpenOption.WRITE,
            ).use { out ->
                inputFiles.sortedBy { it.lastModified() }.forEach { file ->
                    FileChannel.open(file.toPath(), java.nio.file.StandardOpenOption.READ).use { input ->
                        input.transferTo(0, input.size(), out)
                    }
                }
            }
        }
    }

    private val rfc3339Formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    override fun doWork(): Result {
        if (runAttemptCount > 10) {
            AppLogStore.error(applicationContext, TAG, "Feedback upload exceeded retry limit")
            return Result.failure()
        }

        val feedbackId = inputData.getString(INPUT_FEEDBACK_ID)
        val feedbackTimestamp = inputData.getLong(INPUT_FEEDBACK_TIMESTAMP, 0)
        val inproxyId = inputData.getString(INPUT_INPROXY_ID) ?: "unknown"

        if (feedbackId.isNullOrBlank() || feedbackTimestamp <= 0L) {
            AppLogStore.error(applicationContext, TAG, "Feedback worker missing required input")
            return Result.failure()
        }

        return try {
            createFeedbackSnapshot(applicationContext, feedbackId)
            cleanupOldFeedbackFiles(
                applicationContext,
                System.currentTimeMillis() - TimeUnit.HOURS.toMillis(6),
            )

            val psiphonConfig = JSONObject(
                Utils.readRawResourceFileAsString(applicationContext, R.raw.android_psiphon_config),
            )

            val feedbackPayload = createFeedbackPayload(psiphonConfig, feedbackId, feedbackTimestamp, inproxyId)
            sendFeedback(psiphonConfig.toString(), feedbackPayload)
            deleteFeedbackSnapshot(feedbackId)
            AppLogStore.info(applicationContext, TAG, "Feedback upload succeeded: $feedbackId")
            Result.success()
        } catch (error: Exception) {
            AppLogStore.error(applicationContext, TAG, "Feedback upload failed: ${error.message}")
            Result.failure()
        }
    }

    @Throws(Exception::class)
    private fun createFeedbackPayload(
        psiphonConfig: JSONObject,
        feedbackId: String,
        feedbackTimestamp: Long,
        inproxyId: String,
    ): String {
        val root = JSONObject()

        val metadata = JSONObject()
            .put("platform", "android")
            .put("version", METADATA_VERSION)
            .put("id", feedbackId)
            .put("date!!timestamp", formatTimestamp(feedbackTimestamp))
            .put("appName", "conduit")
        root.put("Metadata", metadata)

        val packageInfo = applicationContext.packageManager.getPackageInfo(applicationContext.packageName, 0)
        val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.longVersionCode.toString()
        } else {
            @Suppress("DEPRECATION")
            packageInfo.versionCode.toString()
        }

        val systemInformation = JSONObject()
            .put(
                "Build",
                JSONObject()
                    .put("BRAND", Build.BRAND)
                    .put("SUPPORTED_ABIS", Build.SUPPORTED_ABIS.joinToString(","))
                    .put("MANUFACTURER", Build.MANUFACTURER)
                    .put("MODEL", Build.MODEL)
                    .put("DISPLAY", Build.DISPLAY)
                    .put("TAGS", Build.TAGS)
                    .put("VERSION__CODENAME", Build.VERSION.CODENAME)
                    .put("VERSION__RELEASE", Build.VERSION.RELEASE)
                    .put("VERSION__SDK_INT", Build.VERSION.SDK_INT),
            )
            .put("language", languageCode())
            .put("networkTypeName", networkTypeName())
        root.put("SystemInformation", systemInformation)

        val applicationInfo = JSONObject()
            .put("applicationId", applicationContext.packageName)
            .put("clientVersion", versionCode)
        root.put("ApplicationInfo", applicationInfo)

        val psiphonInfo = JSONObject()
            .put("PROPAGATION_CHANNEL_ID", psiphonConfig.optString("PropagationChannelId"))
            .put("SPONSOR_ID", psiphonConfig.optString("SponsorId"))
            .put("CLIENT_VERSION", versionCode)
            .put("INPROXY_ID", inproxyId)
        root.put("PsiphonInfo", psiphonInfo)

        root.put("Logs", readCombinedLogs(feedbackId))
        return root.toString()
    }

    private fun sendFeedback(psiphonConfig: String, feedbackPayload: String) {
        val latch = CountDownLatch(1)
        var completedError: Exception? = null
        val feedback = PsiphonTunnel.PsiphonTunnelFeedback()

        feedback.startSendFeedback(
            applicationContext,
            object : PsiphonTunnel.HostFeedbackHandler {
                override fun sendFeedbackCompleted(e: Exception?) {
                    completedError = e
                    latch.countDown()
                }
            },
            object : PsiphonTunnel.HostLogger {},
            psiphonConfig,
            feedbackPayload,
            "",
            "",
            "",
        )

        if (!latch.await(10, TimeUnit.MINUTES)) {
            feedback.shutdown()
            throw IOException("Feedback upload timed out")
        }

        feedback.shutdown()
        if (completedError != null) {
            throw completedError as Exception
        }
    }

    @Throws(IOException::class)
    private fun readCombinedLogs(feedbackId: String): JSONArray {
        val feedbackDir = feedbackDirectory()
        val appLogSnapshot = File(feedbackDir, "app.$feedbackId.feedback")
        val tunnelCoreSnapshot = File(feedbackDir, "tunnelcore.$feedbackId.feedback")

        val sortedLogs = TreeMap<Date, MutableList<JSONObject>>()
        readLogsIntoMap(tunnelCoreSnapshot, sortedLogs, true)
        readLogsIntoMap(appLogSnapshot, sortedLogs, false)

        val result = JSONArray()
        for ((_, entries) in sortedLogs) {
            for (entry in entries) {
                result.put(entry)
            }
        }
        return result
    }

    @Throws(IOException::class)
    private fun readLogsIntoMap(
        file: File,
        logMap: TreeMap<Date, MutableList<JSONObject>>,
        isTunnelCore: Boolean,
    ) {
        if (!file.exists()) {
            return
        }

        BufferedReader(FileReader(file)).use { reader ->
            while (true) {
                val line = reader.readLine() ?: break
                if (line.isBlank()) {
                    continue
                }
                try {
                    val input = JSONObject(line)
                    val timestamp = parseTimestamp(input.getString("timestamp"))
                    val output = if (isTunnelCore) {
                        JSONObject()
                            .put("timestamp!!timestamp", input.getString("timestamp"))
                            .put("category", "tunnel-core")
                            .put("data", input)
                    } else {
                        JSONObject()
                            .put("timestamp!!timestamp", input.getString("timestamp"))
                            .put("category", input.optString("tag", "app"))
                            .put("message", input.optString("message", ""))
                            .put("level", input.optString("level", "Info"))
                    }
                    val list = logMap.getOrPut(timestamp) { mutableListOf() }
                    list.add(output)
                } catch (_: JSONException) {
                }
            }
        }
    }

    private fun networkTypeName(): String {
        val connectivityManager = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = connectivityManager.activeNetwork ?: return ""
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return ""
            return when {
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "MOBILE"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
                else -> "UNKNOWN"
            }
        }

        @Suppress("DEPRECATION")
        val info: NetworkInfo? = connectivityManager.activeNetworkInfo
        @Suppress("DEPRECATION")
        return info?.typeName ?: ""
    }

    private fun languageCode(): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            return applicationContext.resources.configuration.locales[0].language
        }
        @Suppress("DEPRECATION")
        return applicationContext.resources.configuration.locale.language
    }

    private fun formatTimestamp(timestampMillis: Long): String {
        synchronized(rfc3339Formatter) {
            return rfc3339Formatter.format(Date(timestampMillis))
        }
    }

    private fun parseTimestamp(value: String): Date {
        synchronized(rfc3339Formatter) {
            return rfc3339Formatter.parse(value) ?: Date(0)
        }
    }

    private fun feedbackDirectory(): File {
        val dir = File(Utils.dataRootDirectory(applicationContext), "feedback")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    private fun deleteFeedbackSnapshot(feedbackId: String) {
        val dir = feedbackDirectory()
        File(dir, "app.$feedbackId.feedback").delete()
        File(dir, "tunnelcore.$feedbackId.feedback").delete()
    }

}
