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

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.util.Log
import java.io.File
import java.util.Locale
import java.util.concurrent.Future
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

object AppLogStore {
    private const val TAG = "AppLogStore"
    private const val AUTHORITY_SUFFIX = ".log"
    private const val PATH_INSERT_LOGS = "insert"
    private const val LEGACY_APP_LOG_DIRECTORY = "app_logs"
    private const val LEGACY_APP_LOG_FILE_NAME = "app.log"
    private const val LEGACY_APP_LOG_ARCHIVE_FILE_NAME = "app.log.1"
    private const val MAX_RETRIES = 3
    private const val DEFAULT_FLUSH_TIMEOUT_MS = 2_000L
    private val retryDelaysMs = longArrayOf(100L, 500L, 1_000L)
    private val retryableLogLevels = setOf(Log.ERROR, Log.WARN, Log.INFO)
    private val executorService = Executors.newSingleThreadExecutor()

    fun info(context: Context, tag: String, message: String) {
        log(context, tag, message, Log.INFO, null)
    }

    fun warn(context: Context, tag: String, message: String) {
        log(context, tag, message, Log.WARN, null)
    }

    fun warn(context: Context, tag: String, message: String, error: Throwable) {
        log(context, tag, message, Log.WARN, error)
    }

    fun error(context: Context, tag: String, message: String) {
        log(context, tag, message, Log.ERROR, null)
    }

    fun error(context: Context, tag: String, message: String, error: Throwable) {
        log(context, tag, message, Log.ERROR, error)
    }

    fun allLogFiles(context: Context): List<File> {
        val dataRoot = Utils.dataRootDirectory(context)
        val providerLogs = dataRoot.listFiles { _, name ->
            name.startsWith(LoggingContentProvider.LOG_FILE_NAME) && !name.endsWith(".lck")
        }?.toList().orEmpty()

        val legacyLogDir = File(dataRoot, LEGACY_APP_LOG_DIRECTORY)
        val legacyLogs = listOf(
            File(legacyLogDir, LEGACY_APP_LOG_ARCHIVE_FILE_NAME),
            File(legacyLogDir, LEGACY_APP_LOG_FILE_NAME),
        )

        return (providerLogs + legacyLogs).filter { it.exists() && it.isFile }
    }

    fun flush(timeoutMs: Long = DEFAULT_FLUSH_TIMEOUT_MS): Boolean {
        val barrier: Future<*> = executorService.submit {}
        return try {
            barrier.get(timeoutMs, TimeUnit.MILLISECONDS)
            true
        } catch (error: TimeoutException) {
            barrier.cancel(false)
            Log.w(TAG, String.format(Locale.US, "Timed out flushing logs after %dms", timeoutMs))
            false
        } catch (error: InterruptedException) {
            Thread.currentThread().interrupt()
            barrier.cancel(false)
            Log.w(TAG, "Interrupted while flushing logs", error)
            false
        } catch (error: Exception) {
            Log.w(TAG, "Failed to flush logs", error)
            false
        }
    }

    private fun log(context: Context, tag: String, message: String, level: Int, error: Throwable?) {
        logcat(level, tag, message, error)

        if (level == Log.DEBUG || level == Log.VERBOSE) {
            return
        }

        val appContext = context.applicationContext
        val uri = Uri.parse("content://${appContext.packageName}$AUTHORITY_SUFFIX/$PATH_INSERT_LOGS")
        val values = ContentValues().apply {
            put("tag", tag)
            put("message", messageForFile(message, error))
            put("level", level)
            put("timestamp", System.currentTimeMillis())
        }

        executorService.execute {
            insertWithRetry(appContext, uri, values, level, 0)
        }
    }

    private fun logcat(level: Int, tag: String, message: String, error: Throwable?) {
        when (level) {
            Log.ERROR -> if (error == null) Log.e(tag, message) else Log.e(tag, message, error)
            Log.WARN -> if (error == null) Log.w(tag, message) else Log.w(tag, message, error)
            Log.INFO -> if (error == null) Log.i(tag, message) else Log.i(tag, message, error)
            Log.DEBUG -> if (error == null) Log.d(tag, message) else Log.d(tag, message, error)
            Log.VERBOSE -> if (error == null) Log.v(tag, message) else Log.v(tag, message, error)
            else -> Log.println(level, tag, messageForFile(message, error))
        }
    }

    private fun messageForFile(message: String, error: Throwable?): String {
        return if (error == null) {
            message
        } else {
            String.format(Locale.US, "%s: %s", message, error)
        }
    }

    private fun insertWithRetry(
        context: Context,
        uri: Uri,
        values: ContentValues,
        level: Int,
        attempt: Int,
    ) {
        var currentAttempt = attempt
        while (true) {
            try {
                val result = context.contentResolver.insert(uri, values)
                if (result != null) {
                    return
                }
                throw IllegalStateException("Insert returned null result")
            } catch (error: Exception) {
                Log.e(TAG, String.format(Locale.US, "Insert failed (attempt %d): %s", currentAttempt + 1, error.message))
                if (currentAttempt >= MAX_RETRIES || !retryableLogLevels.contains(level)) {
                    if (level >= Log.ERROR) {
                        Log.e(values.getAsString("tag"), values.getAsString("message"))
                    }
                    return
                }

                val delay = retryDelaysMs.getOrElse(currentAttempt) { retryDelaysMs.last() }
                currentAttempt += 1
                try {
                    Thread.sleep(delay)
                } catch (interrupted: InterruptedException) {
                    Thread.currentThread().interrupt()
                    if (level >= Log.ERROR) {
                        Log.e(values.getAsString("tag"), values.getAsString("message"))
                    }
                    return
                }
            }
        }
    }
}
