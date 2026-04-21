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
import android.content.res.Resources
import android.util.AtomicFile
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.IOException
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets

object Utils {
    private const val SERVICE_RUNNING_FLAG_FILE = "service_running_flag_file"

    fun readRawResourceFileAsString(context: Context, resourceId: Int): String {
        val content = StringBuilder()
        context.resources.openRawResource(resourceId).use { inputStream ->
            BufferedReader(InputStreamReader(inputStream, StandardCharsets.UTF_8)).use { reader ->
                var line = reader.readLine()
                while (line != null) {
                    content.append(line).append('\n')
                    line = reader.readLine()
                }
            }
        }
        return content.toString()
    }

    fun getEmbeddedServers(context: Context): String {
        try {
            return readRawResourceFileAsString(context, R.raw.android_embedded_server_entries)
        } catch (e: IOException) {
            throw IllegalStateException("Failed to read embedded server entries", e)
        } catch (e: Resources.NotFoundException) {
            throw IllegalStateException("Missing android_embedded_server_entries", e)
        }
    }

    fun dataRootDirectory(context: Context): File {
        val rootDirectory = context.applicationContext.filesDir
        val dataRootDirectory = File(rootDirectory, Constants.DATA_ROOT_DIRECTORY_NAME)
        if (!dataRootDirectory.exists() && !dataRootDirectory.mkdirs()) {
            throw IllegalStateException("Failed to create data root directory")
        }
        return dataRootDirectory
    }

    fun setServiceRunningFlag(context: Context, isRunning: Boolean) {
        val flagFile = File(context.applicationContext.filesDir, SERVICE_RUNNING_FLAG_FILE)
        if (isRunning) {
            if (!flagFile.exists()) {
                flagFile.createNewFile()
            }
            clearLegacyServiceRunningFlag(context)
            return
        }

        if (flagFile.exists()) {
            flagFile.delete()
        }
        clearLegacyServiceRunningFlag(context)
    }

    fun getServiceRunningFlag(context: Context): Boolean {
        val flagFile = File(context.applicationContext.filesDir, SERVICE_RUNNING_FLAG_FILE)
        if (flagFile.exists()) {
            return true
        }

        val legacyPrefs = context.getSharedPreferences(Constants.INPROXY_PREFS, Context.MODE_PRIVATE)
        if (!legacyPrefs.getBoolean(Constants.SERVICE_RUNNING_FLAG_KEY, false)) {
            return false
        }

        setServiceRunningFlag(context, true)
        return true
    }

    fun readJsonFile(file: File): JSONObject? {
        if (!file.exists()) {
            return null
        }

        return try {
            JSONObject(file.readText(Charsets.UTF_8))
        } catch (_: Exception) {
            null
        }
    }

    @Throws(IOException::class)
    fun writeAtomicJson(file: File, payload: JSONObject) {
        val atomicFile = AtomicFile(file)
        val bytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
        val output = atomicFile.startWrite()
        try {
            output.write(bytes)
            atomicFile.finishWrite(output)
        } catch (error: IOException) {
            atomicFile.failWrite(output)
            throw error
        }
    }

    private fun clearLegacyServiceRunningFlag(context: Context) {
        context.getSharedPreferences(Constants.INPROXY_PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(Constants.SERVICE_RUNNING_FLAG_KEY)
            .apply()
    }
}
