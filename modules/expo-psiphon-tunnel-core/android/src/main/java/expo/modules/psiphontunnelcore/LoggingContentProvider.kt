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

import android.content.ContentProvider
import android.content.ContentValues
import android.content.UriMatcher
import android.database.Cursor
import android.net.Uri
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.logging.FileHandler
import java.util.logging.Formatter
import java.util.logging.Level
import java.util.logging.LogRecord
import java.util.logging.Logger

class LoggingContentProvider : ContentProvider() {
    companion object {
        const val LOG_FILE_NAME = "conduit_log"

        private const val TAG = "LoggingContentProvider"
        private const val LOG_FILE_SIZE = Constants.QUARTER_MB
        private const val LOG_FILE_COUNT = 2
        private const val AUTHORITY_SUFFIX = ".log"
        private const val PATH_INSERT_LOGS = "insert"
        private const val MATCH_INSERT = 1
        private val uriMatcher = UriMatcher(UriMatcher.NO_MATCH)
        private val timestampFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }

        private fun intToLevel(level: Int): Level {
            return when (level) {
                Log.VERBOSE -> Level.FINEST
                Log.DEBUG -> Level.FINE
                Log.INFO -> Level.INFO
                Log.WARN -> Level.WARNING
                Log.ERROR -> Level.SEVERE
                else -> throw IllegalArgumentException("Invalid log level: $level")
            }
        }

        private fun levelToString(level: Level): String {
            return when (level) {
                Level.FINEST -> "Verbose"
                Level.FINE -> "Debug"
                Level.INFO -> "Info"
                Level.WARNING -> "Warning"
                Level.SEVERE -> "Error"
                else -> throw IllegalArgumentException("Invalid log level: $level")
            }
        }

        private fun rfc3339Timestamp(timeMillis: Long): String {
            synchronized(timestampFormatter) {
                return timestampFormatter.format(Date(timeMillis))
            }
        }
    }

    private val loggerLock = Any()
    @Volatile
    private var logger: Logger? = null

    override fun onCreate(): Boolean {
        val providerContext = context ?: return false
        val authority = providerContext.packageName + AUTHORITY_SUFFIX
        uriMatcher.addURI(authority, PATH_INSERT_LOGS, MATCH_INSERT)
        return true
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? {
        if (uriMatcher.match(uri) != MATCH_INSERT) {
            throw IllegalArgumentException("Unknown URI: $uri")
        }
        if (values == null) {
            throw IllegalArgumentException("ContentValues cannot be null")
        }

        val tag = values.getAsString("tag")
        val message = values.getAsString("message")
        val level = values.getAsInteger("level")
        val timestamp = values.getAsLong("timestamp")
        if (tag == null || message == null || level == null || timestamp == null) {
            throw IllegalArgumentException(
                String.format(
                    Locale.US,
                    "Missing required fields. tag: %s, message: %s, level: %s, timestamp: %s",
                    if (tag != null) "present" else "missing",
                    if (message != null) "present" else "missing",
                    if (level != null) "present" else "missing",
                    if (timestamp != null) "present" else "missing",
                ),
            )
        }

        synchronized(loggerLock) {
            val record = LogRecord(intToLevel(level), message).apply {
                loggerName = tag
                millis = timestamp
            }
            getLoggerLocked().log(record)
        }
        return uri
    }

    private fun getLoggerLocked(): Logger {
        val existing = logger
        if (existing != null) {
            return existing
        }
        return initializeLoggerLocked()
    }

    private fun initializeLoggerLocked(): Logger {
        val initialized = Logger.getLogger(LoggingContentProvider::class.java.name)
        initialized.level = Level.ALL
        initialized.useParentHandlers = false

        initialized.handlers.forEach { handler ->
            try {
                handler.close()
                initialized.removeHandler(handler)
            } catch (error: Exception) {
                Log.e(TAG, "Error cleaning up handler", error)
            }
        }

        try {
            val providerContext = context ?: throw IllegalStateException("Provider context unavailable")
            val dataDir = Utils.dataRootDirectory(providerContext)
            val fileHandler = FileHandler(
                File(dataDir, LOG_FILE_NAME).absolutePath,
                LOG_FILE_SIZE,
                LOG_FILE_COUNT,
                true,
            )
            fileHandler.formatter = JsonFormatter()
            fileHandler.level = Level.ALL
            initialized.addHandler(fileHandler)
        } catch (error: IOException) {
            Log.e(TAG, "Failed to initialize logger", error)
            throw IllegalStateException("Logger initialization failed", error)
        }

        logger = initialized
        return initialized
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor? {
        throw UnsupportedOperationException("Not implemented")
    }

    override fun getType(uri: Uri): String? {
        throw UnsupportedOperationException("Not implemented")
    }

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int {
        throw UnsupportedOperationException("Not implemented")
    }

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int {
        throw UnsupportedOperationException("Not implemented")
    }

    override fun shutdown() {
        synchronized(loggerLock) {
            logger?.handlers?.forEach { handler ->
                try {
                    handler.close()
                    logger?.removeHandler(handler)
                } catch (error: Exception) {
                    Log.e(TAG, "Error closing handler during shutdown", error)
                }
            }
            logger = null
        }
        super.shutdown()
    }

    private class JsonFormatter : Formatter() {
        override fun format(record: LogRecord): String {
            val payload = JSONObject()
                .put("tag", record.loggerName)
                .put("message", record.message)
                .put("level", levelToString(record.level))
                .put("timestamp", rfc3339Timestamp(record.millis))
            return payload.toString() + "\n"
        }
    }
}
