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
import android.content.Intent
import org.json.JSONObject
import java.io.File

data class InproxyParameters(
    val maxClients: Int,
    val maxPersonalClients: Int,
    val personalCompartmentId: String?,
    val limitUpstreamBytesPerSecond: Int,
    val limitDownstreamBytesPerSecond: Int,
    val privateKey: String,
    val reducedStartTime: String?,
    val reducedEndTime: String?,
    val reducedMaxClients: Int?,
    val reducedLimitUpstreamBytesPerSecond: Int?,
    val reducedLimitDownstreamBytesPerSecond: Int?,
) {
    companion object {
        private const val FILE_NAME = "inproxy_params.json"
        private const val LEGACY_PREFS_NAME = "PsiphonTunnelCoreInproxyParams"
        private const val KEY_MAX_CLIENTS = "maxClients"
        private const val KEY_MAX_PERSONAL_CLIENTS = "maxPersonalClients"
        private const val KEY_PERSONAL_COMPARTMENT_ID = "personalCompartmentId"
        private const val KEY_LIMIT_UPSTREAM = "limitUpstreamBytesPerSecond"
        private const val KEY_LIMIT_DOWNSTREAM = "limitDownstreamBytesPerSecond"
        private const val KEY_PRIVATE_KEY = "privateKey"
        private const val KEY_REDUCED_START = "reducedStartTime"
        private const val KEY_REDUCED_END = "reducedEndTime"
        private const val KEY_REDUCED_MAX_CLIENTS = "reducedMaxClients"
        private const val KEY_REDUCED_LIMIT_UPSTREAM =
            "reducedLimitUpstreamBytesPerSecond"
        private const val KEY_REDUCED_LIMIT_DOWNSTREAM =
            "reducedLimitDownstreamBytesPerSecond"

        fun fromMap(map: Map<String, Any?>): InproxyParameters? {
            val maxClients = (map[KEY_MAX_CLIENTS] as? Number)?.toInt() ?: return null
            val maxPersonalClients = (map[KEY_MAX_PERSONAL_CLIENTS] as? Number)?.toInt() ?: 0
            val personalCompartmentId =
                (map[KEY_PERSONAL_COMPARTMENT_ID] as? String)
                    ?.trim()
                    ?.takeIf { it.isNotEmpty() }
            val limitUpstream = (map[KEY_LIMIT_UPSTREAM] as? Number)?.toInt() ?: return null
            val limitDownstream = (map[KEY_LIMIT_DOWNSTREAM] as? Number)?.toInt() ?: return null
            val privateKey = map[KEY_PRIVATE_KEY] as? String ?: return null

            val reducedStart = map[KEY_REDUCED_START] as? String
            val reducedEnd = map[KEY_REDUCED_END] as? String
            val reducedMaxClients =
                (map[KEY_REDUCED_MAX_CLIENTS] as? Number)?.toInt()
            val reducedLimitUpstream =
                (map[KEY_REDUCED_LIMIT_UPSTREAM] as? Number)?.toInt()
            val reducedLimitDownstream =
                (map[KEY_REDUCED_LIMIT_DOWNSTREAM] as? Number)?.toInt()

            val params = InproxyParameters(
                maxClients = maxClients,
                maxPersonalClients = maxPersonalClients,
                personalCompartmentId = personalCompartmentId,
                limitUpstreamBytesPerSecond = limitUpstream,
                limitDownstreamBytesPerSecond = limitDownstream,
                privateKey = privateKey,
                reducedStartTime = reducedStart,
                reducedEndTime = reducedEnd,
                reducedMaxClients = reducedMaxClients,
                reducedLimitUpstreamBytesPerSecond = reducedLimitUpstream,
                reducedLimitDownstreamBytesPerSecond = reducedLimitDownstream,
            )
            return if (params.isValid()) params else null
        }

        fun fromIntent(intent: Intent): InproxyParameters? {
            if (
                !intent.hasExtra(KEY_MAX_CLIENTS) ||
                    !intent.hasExtra(KEY_LIMIT_UPSTREAM) ||
                    !intent.hasExtra(KEY_LIMIT_DOWNSTREAM) ||
                    !intent.hasExtra(KEY_PRIVATE_KEY)
            ) {
                return null
            }

            val params = InproxyParameters(
                maxClients = intent.getIntExtra(KEY_MAX_CLIENTS, -1),
                maxPersonalClients = if (intent.hasExtra(KEY_MAX_PERSONAL_CLIENTS)) {
                    intent.getIntExtra(KEY_MAX_PERSONAL_CLIENTS, 0)
                } else {
                    0
                },
                personalCompartmentId =
                    intent.getStringExtra(KEY_PERSONAL_COMPARTMENT_ID)
                        ?.trim()
                        ?.takeIf { it.isNotEmpty() },
                limitUpstreamBytesPerSecond =
                    intent.getIntExtra(KEY_LIMIT_UPSTREAM, -1),
                limitDownstreamBytesPerSecond =
                    intent.getIntExtra(KEY_LIMIT_DOWNSTREAM, -1),
                privateKey = intent.getStringExtra(KEY_PRIVATE_KEY) ?: return null,
                reducedStartTime = intent.getStringExtra(KEY_REDUCED_START),
                reducedEndTime = intent.getStringExtra(KEY_REDUCED_END),
                reducedMaxClients = if (intent.hasExtra(KEY_REDUCED_MAX_CLIENTS)) {
                    intent.getIntExtra(KEY_REDUCED_MAX_CLIENTS, -1)
                } else {
                    null
                },
                reducedLimitUpstreamBytesPerSecond =
                    if (intent.hasExtra(KEY_REDUCED_LIMIT_UPSTREAM)) {
                        intent.getIntExtra(KEY_REDUCED_LIMIT_UPSTREAM, -1)
                    } else {
                        null
                    },
                reducedLimitDownstreamBytesPerSecond =
                    if (intent.hasExtra(KEY_REDUCED_LIMIT_DOWNSTREAM)) {
                        intent.getIntExtra(KEY_REDUCED_LIMIT_DOWNSTREAM, -1)
                    } else {
                        null
                    },
            )
            return if (params.isValid()) params else null
        }

        fun load(context: Context): InproxyParameters? {
            loadFromFile(context)?.let { return it }

            val prefs =
                context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
            if (
                !prefs.contains(KEY_MAX_CLIENTS) ||
                    !prefs.contains(KEY_LIMIT_UPSTREAM) ||
                    !prefs.contains(KEY_LIMIT_DOWNSTREAM) ||
                    !prefs.contains(KEY_PRIVATE_KEY)
            ) {
                return null
            }

            val params = InproxyParameters(
                maxClients = prefs.getInt(KEY_MAX_CLIENTS, -1),
                maxPersonalClients = if (prefs.contains(KEY_MAX_PERSONAL_CLIENTS)) {
                    prefs.getInt(KEY_MAX_PERSONAL_CLIENTS, 0)
                } else {
                    0
                },
                personalCompartmentId =
                    prefs.getString(KEY_PERSONAL_COMPARTMENT_ID, null)
                        ?.trim()
                        ?.takeIf { it.isNotEmpty() },
                limitUpstreamBytesPerSecond = prefs.getInt(KEY_LIMIT_UPSTREAM, -1),
                limitDownstreamBytesPerSecond =
                    prefs.getInt(KEY_LIMIT_DOWNSTREAM, -1),
                privateKey = prefs.getString(KEY_PRIVATE_KEY, null) ?: return null,
                reducedStartTime = prefs.getString(KEY_REDUCED_START, null),
                reducedEndTime = prefs.getString(KEY_REDUCED_END, null),
                reducedMaxClients = if (prefs.contains(KEY_REDUCED_MAX_CLIENTS)) {
                    prefs.getInt(KEY_REDUCED_MAX_CLIENTS, -1)
                } else {
                    null
                },
                reducedLimitUpstreamBytesPerSecond =
                    if (prefs.contains(KEY_REDUCED_LIMIT_UPSTREAM)) {
                        prefs.getInt(KEY_REDUCED_LIMIT_UPSTREAM, -1)
                    } else {
                        null
                    },
                reducedLimitDownstreamBytesPerSecond =
                    if (prefs.contains(KEY_REDUCED_LIMIT_DOWNSTREAM)) {
                        prefs.getInt(KEY_REDUCED_LIMIT_DOWNSTREAM, -1)
                    } else {
                        null
                    },
            )
            if (!params.isValid()) {
                return null
            }

            try {
                writeToFile(context, params)
                clearLegacyPrefs(context)
            } catch (_: Exception) {
            }
            return params
        }

        private fun loadFromFile(context: Context): InproxyParameters? {
            val payload = Utils.readJsonFile(fileForContext(context)) ?: return null
            val params = InproxyParameters(
                maxClients = payload.optInt(KEY_MAX_CLIENTS, -1),
                maxPersonalClients = if (payload.has(KEY_MAX_PERSONAL_CLIENTS)) {
                    payload.optInt(KEY_MAX_PERSONAL_CLIENTS, 0)
                } else {
                    0
                },
                personalCompartmentId =
                    payload
                        .takeIf { it.has(KEY_PERSONAL_COMPARTMENT_ID) }
                        ?.optString(KEY_PERSONAL_COMPARTMENT_ID)
                        ?.trim()
                        ?.takeIf { it.isNotEmpty() },
                limitUpstreamBytesPerSecond = payload.optInt(KEY_LIMIT_UPSTREAM, -1),
                limitDownstreamBytesPerSecond =
                    payload.optInt(KEY_LIMIT_DOWNSTREAM, -1),
                privateKey = payload.optString(KEY_PRIVATE_KEY, ""),
                reducedStartTime = payload.takeIf { it.has(KEY_REDUCED_START) }
                    ?.optString(KEY_REDUCED_START),
                reducedEndTime = payload.takeIf { it.has(KEY_REDUCED_END) }
                    ?.optString(KEY_REDUCED_END),
                reducedMaxClients = if (payload.has(KEY_REDUCED_MAX_CLIENTS)) {
                    payload.optInt(KEY_REDUCED_MAX_CLIENTS, -1)
                } else {
                    null
                },
                reducedLimitUpstreamBytesPerSecond =
                    if (payload.has(KEY_REDUCED_LIMIT_UPSTREAM)) {
                        payload.optInt(KEY_REDUCED_LIMIT_UPSTREAM, -1)
                    } else {
                        null
                    },
                reducedLimitDownstreamBytesPerSecond =
                    if (payload.has(KEY_REDUCED_LIMIT_DOWNSTREAM)) {
                        payload.optInt(KEY_REDUCED_LIMIT_DOWNSTREAM, -1)
                    } else {
                        null
                    },
            )
            return if (params.isValid()) params else null
        }

        private fun writeToFile(context: Context, params: InproxyParameters) {
            Utils.writeAtomicJson(fileForContext(context), params.toJson())
        }

        private fun fileForContext(context: Context): File {
            return File(context.applicationContext.filesDir, FILE_NAME)
        }

        private fun clearLegacyPrefs(context: Context) {
            context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .clear()
                .apply()
        }
    }

    fun putIntoIntent(intent: Intent) {
        intent.putExtra(KEY_MAX_CLIENTS, maxClients)
        intent.putExtra(KEY_MAX_PERSONAL_CLIENTS, maxPersonalClients)
        personalCompartmentId?.let { intent.putExtra(KEY_PERSONAL_COMPARTMENT_ID, it) }
        intent.putExtra(KEY_LIMIT_UPSTREAM, limitUpstreamBytesPerSecond)
        intent.putExtra(KEY_LIMIT_DOWNSTREAM, limitDownstreamBytesPerSecond)
        intent.putExtra(KEY_PRIVATE_KEY, privateKey)
        reducedStartTime?.let { intent.putExtra(KEY_REDUCED_START, it) }
        reducedEndTime?.let { intent.putExtra(KEY_REDUCED_END, it) }
        reducedMaxClients?.let { intent.putExtra(KEY_REDUCED_MAX_CLIENTS, it) }
        reducedLimitUpstreamBytesPerSecond?.let {
            intent.putExtra(KEY_REDUCED_LIMIT_UPSTREAM, it)
        }
        reducedLimitDownstreamBytesPerSecond?.let {
            intent.putExtra(KEY_REDUCED_LIMIT_DOWNSTREAM, it)
        }
    }

    fun store(context: Context): Boolean {
        val current = load(context)
        if (current == this) {
            return false
        }

        writeToFile(context, this)
        clearLegacyPrefs(context)
        return true
    }

    private fun isValid(): Boolean {
        if (maxClients < 0 || maxPersonalClients < 0) return false
        if (maxClients + maxPersonalClients <= 0) return false
        if (maxClients + maxPersonalClients > 30) return false
        if (maxPersonalClients > 0 && personalCompartmentId.isNullOrBlank()) return false
        if (limitUpstreamBytesPerSecond < 0 || limitDownstreamBytesPerSecond < 0) return false
        if (privateKey.isBlank()) return false

        val reducedValues = listOf(
            reducedStartTime,
            reducedEndTime,
            reducedMaxClients,
            reducedLimitUpstreamBytesPerSecond,
            reducedLimitDownstreamBytesPerSecond,
        )
        val hasAnyReduced = reducedValues.any { it != null }
        if (!hasAnyReduced) {
            return true
        }
        val hasAllReduced = reducedValues.all { it != null }
        if (!hasAllReduced) {
            return false
        }

        if (!isTimeOfDay(reducedStartTime) || !isTimeOfDay(reducedEndTime)) return false
        if (reducedStartTime == reducedEndTime) return false
        if ((reducedMaxClients ?: 0) <= 0) return false
        if ((reducedMaxClients ?: 0) > maxClients) return false
        if ((reducedLimitUpstreamBytesPerSecond ?: -1) < 0) return false
        if ((reducedLimitDownstreamBytesPerSecond ?: -1) < 0) return false

        return true
    }

    private fun isTimeOfDay(value: String?): Boolean {
        if (value == null) return false
        return value.matches(Regex("^([01]\\d|2[0-3]):([0-5]\\d)$"))
    }

    private fun toJson(): JSONObject {
        return JSONObject().apply {
            put(KEY_MAX_CLIENTS, maxClients)
            put(KEY_MAX_PERSONAL_CLIENTS, maxPersonalClients)
            if (!personalCompartmentId.isNullOrBlank()) {
                put(KEY_PERSONAL_COMPARTMENT_ID, personalCompartmentId)
            }
            put(KEY_LIMIT_UPSTREAM, limitUpstreamBytesPerSecond)
            put(KEY_LIMIT_DOWNSTREAM, limitDownstreamBytesPerSecond)
            put(KEY_PRIVATE_KEY, privateKey)
            if (reducedStartTime != null) {
                put(KEY_REDUCED_START, reducedStartTime)
            }
            if (reducedEndTime != null) {
                put(KEY_REDUCED_END, reducedEndTime)
            }
            if (reducedMaxClients != null) {
                put(KEY_REDUCED_MAX_CLIENTS, reducedMaxClients)
            }
            if (reducedLimitUpstreamBytesPerSecond != null) {
                put(KEY_REDUCED_LIMIT_UPSTREAM, reducedLimitUpstreamBytesPerSecond)
            }
            if (reducedLimitDownstreamBytesPerSecond != null) {
                put(KEY_REDUCED_LIMIT_DOWNSTREAM, reducedLimitDownstreamBytesPerSecond)
            }
        }
    }
}
