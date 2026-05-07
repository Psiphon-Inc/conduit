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
import android.content.SharedPreferences
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
        private const val LEGACY_PREFS_NAME = "ConduitServiceParamsPrefs"
        private const val LEGACY_SCHEMA_VERSION = 1
        private const val KEY_SCHEMA_VERSION = "schemaVersion"
        private const val KEY_MAX_CLIENTS = "maxClients"
        private const val KEY_MAX_PERSONAL_CLIENTS = "maxPersonalClients"
        private const val KEY_PERSONAL_COMPARTMENT_ID = "personalCompartmentId"
        private const val KEY_LIMIT_UPSTREAM = "limitUpstreamBytesPerSecond"
        private const val KEY_LIMIT_DOWNSTREAM = "limitDownstreamBytesPerSecond"
        private const val KEY_PRIVATE_KEY = "privateKey"
        private const val LEGACY_KEY_LIMIT_UPSTREAM = "limitUpstreamBytes"
        private const val LEGACY_KEY_LIMIT_DOWNSTREAM = "limitDownstreamBytes"
        private const val LEGACY_KEY_PRIVATE_KEY = "inProxyPrivateKey"
        private const val KEY_REDUCED_START = "reducedStartTime"
        private const val KEY_REDUCED_END = "reducedEndTime"
        private const val KEY_REDUCED_MAX_CLIENTS = "reducedMaxClients"
        private const val KEY_REDUCED_LIMIT_UPSTREAM =
            "reducedLimitUpstreamBytesPerSecond"
        private const val KEY_REDUCED_LIMIT_DOWNSTREAM =
            "reducedLimitDownstreamBytesPerSecond"

        fun fromMap(map: Map<String, Any?>): InproxyParameters? {
            val maxClients = parseRequiredInt(map, KEY_MAX_CLIENTS) ?: return null
            val maxPersonalClients = if (map[KEY_MAX_PERSONAL_CLIENTS] != null) {
                parseRequiredInt(map, KEY_MAX_PERSONAL_CLIENTS) ?: return null
            } else {
                0
            }
            val personalCompartmentId =
                (map[KEY_PERSONAL_COMPARTMENT_ID] as? String)
                    ?.trim()
                    ?.takeIf { it.isNotEmpty() }
            val limitUpstream = parseRequiredInt(map, KEY_LIMIT_UPSTREAM) ?: return null
            val limitDownstream = parseRequiredInt(map, KEY_LIMIT_DOWNSTREAM) ?: return null
            val privateKey = map[KEY_PRIVATE_KEY] as? String ?: return null

            val reducedStart = map[KEY_REDUCED_START] as? String
            val reducedEnd = map[KEY_REDUCED_END] as? String
            if (hasInvalidOptionalInt(map, KEY_REDUCED_MAX_CLIENTS)) return null
            if (hasInvalidOptionalInt(map, KEY_REDUCED_LIMIT_UPSTREAM)) return null
            if (hasInvalidOptionalInt(map, KEY_REDUCED_LIMIT_DOWNSTREAM)) return null
            val reducedMaxClients = parseOptionalInt(map, KEY_REDUCED_MAX_CLIENTS)
            val reducedLimitUpstream = parseOptionalInt(map, KEY_REDUCED_LIMIT_UPSTREAM)
            val reducedLimitDownstream = parseOptionalInt(map, KEY_REDUCED_LIMIT_DOWNSTREAM)

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

        private fun parseRequiredInt(map: Map<String, Any?>, key: String): Int? {
            return exactInt(map[key] as? Number ?: return null)
        }

        private fun parseOptionalInt(map: Map<String, Any?>, key: String): Int? {
            val value = map[key] ?: return null
            return exactInt(value as? Number ?: return null)
        }

        private fun hasInvalidOptionalInt(map: Map<String, Any?>, key: String): Boolean {
            val value = map[key] ?: return false
            return value !is Number || exactInt(value) == null
        }

        private fun exactInt(value: Number): Int? {
            return when (value) {
                is Byte, is Short, is Int -> value.toInt()
                is Long -> value.takeIf {
                    it in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong()
                }?.toInt()
                is java.math.BigInteger -> value.takeIf {
                    it >= java.math.BigInteger.valueOf(Int.MIN_VALUE.toLong()) &&
                        it <= java.math.BigInteger.valueOf(Int.MAX_VALUE.toLong())
                }?.toInt()
                is java.math.BigDecimal -> try {
                    value.intValueExact()
                } catch (_: ArithmeticException) {
                    null
                }
                is Float -> value.toDouble().takeIf { it.isFinite() && it % 1.0 == 0.0 }
                    ?.takeIf { it in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble() }
                    ?.toInt()
                is Double -> value.takeIf { it.isFinite() && it % 1.0 == 0.0 }
                    ?.takeIf { it in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble() }
                    ?.toInt()
                else -> value.toDouble().takeIf { it.isFinite() && it % 1.0 == 0.0 }
                    ?.takeIf { it in Int.MIN_VALUE.toDouble()..Int.MAX_VALUE.toDouble() }
                    ?.toInt()
            }
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
            migrateLegacyPrefs(prefs)
            if (
                !prefs.contains(KEY_MAX_CLIENTS) ||
                    !prefs.contains(KEY_LIMIT_UPSTREAM) ||
                    !prefs.contains(KEY_LIMIT_DOWNSTREAM) ||
                    !prefs.contains(KEY_PRIVATE_KEY)
            ) {
                return null
            }

            val params = InproxyParameters(
                maxClients = prefs.getIntOrNull(KEY_MAX_CLIENTS) ?: return null,
                maxPersonalClients = if (prefs.contains(KEY_MAX_PERSONAL_CLIENTS)) {
                    prefs.getIntOrNull(KEY_MAX_PERSONAL_CLIENTS) ?: return null
                } else {
                    0
                },
                personalCompartmentId =
                    prefs.getStringOrNull(KEY_PERSONAL_COMPARTMENT_ID)
                        ?.trim()
                        ?.takeIf { it.isNotEmpty() },
                limitUpstreamBytesPerSecond =
                    prefs.getIntOrNull(KEY_LIMIT_UPSTREAM) ?: return null,
                limitDownstreamBytesPerSecond =
                    prefs.getIntOrNull(KEY_LIMIT_DOWNSTREAM) ?: return null,
                privateKey = prefs.getStringOrNull(KEY_PRIVATE_KEY) ?: return null,
                reducedStartTime = prefs.getStringOrNull(KEY_REDUCED_START),
                reducedEndTime = prefs.getStringOrNull(KEY_REDUCED_END),
                reducedMaxClients = if (prefs.contains(KEY_REDUCED_MAX_CLIENTS)) {
                    prefs.getIntOrNull(KEY_REDUCED_MAX_CLIENTS) ?: return null
                } else {
                    null
                },
                reducedLimitUpstreamBytesPerSecond =
                    if (prefs.contains(KEY_REDUCED_LIMIT_UPSTREAM)) {
                        prefs.getIntOrNull(KEY_REDUCED_LIMIT_UPSTREAM) ?: return null
                    } else {
                        null
                    },
                reducedLimitDownstreamBytesPerSecond =
                    if (prefs.contains(KEY_REDUCED_LIMIT_DOWNSTREAM)) {
                        prefs.getIntOrNull(KEY_REDUCED_LIMIT_DOWNSTREAM) ?: return null
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

        private fun migrateLegacyPrefs(prefs: SharedPreferences) {
            if ((prefs.getIntOrNull(KEY_SCHEMA_VERSION) ?: 0) >= LEGACY_SCHEMA_VERSION) {
                return
            }

            val values = prefs.all
            val editor = prefs.edit()
            if (!prefs.contains(KEY_LIMIT_UPSTREAM)) {
                (values[LEGACY_KEY_LIMIT_UPSTREAM] as? Int)?.let {
                    editor.putInt(KEY_LIMIT_UPSTREAM, it)
                }
            }
            if (!prefs.contains(KEY_LIMIT_DOWNSTREAM)) {
                (values[LEGACY_KEY_LIMIT_DOWNSTREAM] as? Int)?.let {
                    editor.putInt(KEY_LIMIT_DOWNSTREAM, it)
                }
            }
            if (!prefs.contains(KEY_PRIVATE_KEY)) {
                (values[LEGACY_KEY_PRIVATE_KEY] as? String)?.let {
                    editor.putString(KEY_PRIVATE_KEY, it)
                }
            }
            editor.putInt(KEY_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION)
            editor.apply()
        }

        private fun SharedPreferences.getIntOrNull(key: String): Int? {
            return try {
                if (contains(key)) getInt(key, -1) else null
            } catch (_: ClassCastException) {
                null
            }
        }

        private fun SharedPreferences.getStringOrNull(key: String): String? {
            return try {
                getString(key, null)
            } catch (_: ClassCastException) {
                null
            }
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
