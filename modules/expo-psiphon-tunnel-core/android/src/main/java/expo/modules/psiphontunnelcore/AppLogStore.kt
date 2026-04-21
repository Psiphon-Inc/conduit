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
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object AppLogStore {
    private const val APP_LOG_FILE_NAME = "app.log"
    private const val APP_LOG_ARCHIVE_FILE_NAME = "app.log.1"
    private const val MAX_LOG_FILE_BYTES = 100 * 1024L
    private val lock = Any()
    private val timestampFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    fun info(context: Context, tag: String, message: String) {
        Log.i(tag, message)
        append(context, "Info", tag, message)
    }

    fun warn(context: Context, tag: String, message: String) {
        Log.w(tag, message)
        append(context, "Warning", tag, message)
    }

    fun error(context: Context, tag: String, message: String) {
        Log.e(tag, message)
        append(context, "Error", tag, message)
    }

    fun allLogFiles(context: Context): List<File> {
        val logDir = logDirectory(context)
        return listOf(
            File(logDir, APP_LOG_ARCHIVE_FILE_NAME),
            File(logDir, APP_LOG_FILE_NAME),
        ).filter { it.exists() }
    }

    private fun append(context: Context, level: String, tag: String, message: String) {
        synchronized(lock) {
            val logDir = logDirectory(context)
            rotateIfNeeded(logDir)
            val payload = JSONObject()
                .put("tag", tag)
                .put("message", message)
                .put("level", level)
                .put("timestamp", rfc3339Timestamp(System.currentTimeMillis()))
                .toString() + "\n"

            FileOutputStream(File(logDir, APP_LOG_FILE_NAME), true).use { output ->
                output.write(payload.toByteArray(StandardCharsets.UTF_8))
            }
        }
    }

    private fun rotateIfNeeded(logDir: File) {
        val current = File(logDir, APP_LOG_FILE_NAME)
        if (!current.exists() || current.length() < MAX_LOG_FILE_BYTES) {
            return
        }

        val archived = File(logDir, APP_LOG_ARCHIVE_FILE_NAME)
        if (archived.exists()) {
            archived.delete()
        }
        current.renameTo(archived)
    }

    private fun logDirectory(context: Context): File {
        val directory = File(Utils.dataRootDirectory(context), "app_logs")
        if (!directory.exists()) {
            directory.mkdirs()
        }
        return directory
    }

    private fun rfc3339Timestamp(timeMillis: Long): String {
        synchronized(timestampFormatter) {
            return timestampFormatter.format(Date(timeMillis))
        }
    }
}
