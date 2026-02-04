/*
 * Copyright (c) 2024, Psiphon Inc.
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
 *
 */

package ca.psiphon.conduit.nativemodule;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.facebook.react.bridge.ReadableMap;

import ca.psiphon.conduit.nativemodule.logging.MyLog;

public record ConduitServiceParameters(
        int maxClients,
        int limitUpstreamBytes,
        int limitDownstreamBytes,
        String privateKey,
        String reducedStartTime,
        String reducedEndTime,
        Integer reducedMaxClients,
        Integer reducedLimitUpstreamBytes,
        Integer reducedLimitDownstreamBytes) {
    public static String TAG = ConduitServiceParameters.class.getSimpleName();

    // Keys and preferences file name
    public static final String PREFS_NAME = "ConduitServiceParamsPrefs";
    public static final String MAX_CLIENTS_KEY = "maxClients";
    public static final String LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY = "limitUpstreamBytesPerSecond";
    public static final String LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY = "limitDownstreamBytesPerSecond";
    public static final String PRIVATE_KEY_KEY = "privateKey";
    public static final String REDUCED_START_TIME_KEY = "reducedStartTime";
    public static final String REDUCED_END_TIME_KEY = "reducedEndTime";
    public static final String REDUCED_MAX_CLIENTS_KEY = "reducedMaxClients";
    public static final String REDUCED_LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY =
            "reducedLimitUpstreamBytesPerSecond";
    public static final String REDUCED_LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY =
            "reducedLimitDownstreamBytesPerSecond";
    public static final String SCHEMA_VERSION_KEY = "schemaVersion";

    // Current storage schema version
    private static final int CURRENT_SCHEMA_VERSION = 1;

    // Parse method for ReadableMap
    public static ConduitServiceParameters parse(ReadableMap map) {
        // Check if all keys are present
        if (!map.hasKey(MAX_CLIENTS_KEY) ||
                !map.hasKey(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY) ||
                !map.hasKey(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY) ||
                !map.hasKey(PRIVATE_KEY_KEY)) {
            return null;
        }

        int maxClients = map.getInt(MAX_CLIENTS_KEY);
        int limitUpstreamBytes = map.getInt(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY);
        int limitDownstreamBytes = map.getInt(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY);
        String proxyPrivateKey = map.getString(PRIVATE_KEY_KEY);
        String reducedStartTime = map.hasKey(REDUCED_START_TIME_KEY)
                ? map.getString(REDUCED_START_TIME_KEY)
                : null;
        String reducedEndTime = map.hasKey(REDUCED_END_TIME_KEY)
                ? map.getString(REDUCED_END_TIME_KEY)
                : null;
        Integer reducedMaxClients = map.hasKey(REDUCED_MAX_CLIENTS_KEY)
                ? map.getInt(REDUCED_MAX_CLIENTS_KEY)
                : null;
        Integer reducedLimitUpstreamBytes =
                map.hasKey(REDUCED_LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY)
                        ? map.getInt(REDUCED_LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY)
                        : null;
        Integer reducedLimitDownstreamBytes =
                map.hasKey(REDUCED_LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY)
                        ? map.getInt(REDUCED_LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY)
                        : null;

        // Validate parsed values
        if (validate(maxClients, limitUpstreamBytes, limitDownstreamBytes, proxyPrivateKey,
                reducedStartTime, reducedEndTime, reducedMaxClients,
                reducedLimitUpstreamBytes, reducedLimitDownstreamBytes)) {
            return new ConduitServiceParameters(
                    maxClients,
                    limitUpstreamBytes,
                    limitDownstreamBytes,
                    proxyPrivateKey,
                    reducedStartTime,
                    reducedEndTime,
                    reducedMaxClients,
                    reducedLimitUpstreamBytes,
                    reducedLimitDownstreamBytes);
        }

        return null;
    }

    // Parse method for Intent
    public static ConduitServiceParameters parse(Intent intent) {
        // Check if all keys are present
        if (!intent.hasExtra(MAX_CLIENTS_KEY) ||
                !intent.hasExtra(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY) ||
                !intent.hasExtra(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY) ||
                !intent.hasExtra(PRIVATE_KEY_KEY)) {
            return null;
        }

        int maxClients = intent.getIntExtra(MAX_CLIENTS_KEY, -1);
        int limitUpstreamBytes = intent.getIntExtra(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, -1);
        int limitDownstreamBytes = intent.getIntExtra(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, -1);
        String proxyPrivateKey = intent.getStringExtra(PRIVATE_KEY_KEY);
        String reducedStartTime = intent.hasExtra(REDUCED_START_TIME_KEY)
                ? intent.getStringExtra(REDUCED_START_TIME_KEY)
                : null;
        String reducedEndTime = intent.hasExtra(REDUCED_END_TIME_KEY)
                ? intent.getStringExtra(REDUCED_END_TIME_KEY)
                : null;
        Integer reducedMaxClients = intent.hasExtra(REDUCED_MAX_CLIENTS_KEY)
                ? intent.getIntExtra(REDUCED_MAX_CLIENTS_KEY, -1)
                : null;
        Integer reducedLimitUpstreamBytes = intent.hasExtra(REDUCED_LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY)
                ? intent.getIntExtra(REDUCED_LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, -1)
                : null;
        Integer reducedLimitDownstreamBytes = intent.hasExtra(REDUCED_LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY)
                ? intent.getIntExtra(REDUCED_LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, -1)
                : null;

        // Validate parsed values
        if (validate(maxClients, limitUpstreamBytes, limitDownstreamBytes, proxyPrivateKey,
                reducedStartTime, reducedEndTime, reducedMaxClients,
                reducedLimitUpstreamBytes, reducedLimitDownstreamBytes)) {
            return new ConduitServiceParameters(
                    maxClients,
                    limitUpstreamBytes,
                    limitDownstreamBytes,
                    proxyPrivateKey,
                    reducedStartTime,
                    reducedEndTime,
                    reducedMaxClients,
                    reducedLimitUpstreamBytes,
                    reducedLimitDownstreamBytes);
        }

        return null;
    }

    // Store the object in SharedPreferences and return true if any values changed
    public boolean store(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE | Context.MODE_MULTI_PROCESS);
        SharedPreferences.Editor editor = preferences.edit();

        boolean changed = false;

        if (preferences.getInt(MAX_CLIENTS_KEY, -1) != maxClients) {
            editor.putInt(MAX_CLIENTS_KEY, maxClients);
            changed = true;
        }

        if (preferences.getInt(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, -1) != limitUpstreamBytes) {
            editor.putInt(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, limitUpstreamBytes);
            changed = true;
        }

        if (preferences.getInt(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, -1) != limitDownstreamBytes) {
            editor.putInt(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, limitDownstreamBytes);
            changed = true;
        }

        // Guard against NPE
        String storedPrivateKey = preferences.getString(PRIVATE_KEY_KEY, null);
        if (storedPrivateKey == null || !storedPrivateKey.equals(privateKey)) {
            editor.putString(PRIVATE_KEY_KEY, privateKey);
            changed = true;
        }

        changed = storeOptionalString(preferences, editor, REDUCED_START_TIME_KEY, reducedStartTime) || changed;
        changed = storeOptionalString(preferences, editor, REDUCED_END_TIME_KEY, reducedEndTime) || changed;
        changed = storeOptionalInt(preferences, editor, REDUCED_MAX_CLIENTS_KEY, reducedMaxClients) || changed;
        changed = storeOptionalInt(preferences, editor, REDUCED_LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, reducedLimitUpstreamBytes) || changed;
        changed = storeOptionalInt(preferences, editor, REDUCED_LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, reducedLimitDownstreamBytes) || changed;

        if (changed) {
            editor.commit();
        }

        return changed;
    }

    // Helper to load parameters from preferences
    public static ConduitServiceParameters load(Context context) {
        migrate(context); // Ensure preferences are up-to-date

        SharedPreferences preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE | Context.MODE_MULTI_PROCESS);

        int maxClients = preferences.getInt(MAX_CLIENTS_KEY, -1);
        int limitUpstreamBytes = preferences.getInt(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, -1);
        int limitDownstreamBytes = preferences.getInt(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, -1);
        String proxyPrivateKey = preferences.getString(PRIVATE_KEY_KEY, null);
        String reducedStartTime = preferences.getString(REDUCED_START_TIME_KEY, null);
        String reducedEndTime = preferences.getString(REDUCED_END_TIME_KEY, null);
        Integer reducedMaxClients = preferences.contains(REDUCED_MAX_CLIENTS_KEY)
                ? preferences.getInt(REDUCED_MAX_CLIENTS_KEY, -1)
                : null;
        Integer reducedLimitUpstreamBytes = preferences.contains(REDUCED_LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY)
                ? preferences.getInt(REDUCED_LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, -1)
                : null;
        Integer reducedLimitDownstreamBytes = preferences.contains(REDUCED_LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY)
                ? preferences.getInt(REDUCED_LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, -1)
                : null;

        // Validate the loaded parameters
        if (validate(maxClients, limitUpstreamBytes, limitDownstreamBytes, proxyPrivateKey,
                reducedStartTime, reducedEndTime, reducedMaxClients,
                reducedLimitUpstreamBytes, reducedLimitDownstreamBytes)) {
            return new ConduitServiceParameters(
                    maxClients,
                    limitUpstreamBytes,
                    limitDownstreamBytes,
                    proxyPrivateKey,
                    reducedStartTime,
                    reducedEndTime,
                    reducedMaxClients,
                    reducedLimitUpstreamBytes,
                    reducedLimitDownstreamBytes);
        }

        return null;
    }

    // Helper to put parameters into an intent
    public void putIntoIntent(Intent intent) {
        intent.putExtra(MAX_CLIENTS_KEY, maxClients);
        intent.putExtra(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, limitUpstreamBytes);
        intent.putExtra(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, limitDownstreamBytes);
        intent.putExtra(PRIVATE_KEY_KEY, privateKey);
        if (reducedStartTime != null) {
            intent.putExtra(REDUCED_START_TIME_KEY, reducedStartTime);
        }
        if (reducedEndTime != null) {
            intent.putExtra(REDUCED_END_TIME_KEY, reducedEndTime);
        }
        if (reducedMaxClients != null) {
            intent.putExtra(REDUCED_MAX_CLIENTS_KEY, reducedMaxClients);
        }
        if (reducedLimitUpstreamBytes != null) {
            intent.putExtra(REDUCED_LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, reducedLimitUpstreamBytes);
        }
        if (reducedLimitDownstreamBytes != null) {
            intent.putExtra(REDUCED_LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, reducedLimitDownstreamBytes);
        }
    }

    // Helper to validate parameters
    private static boolean validate(int maxClients, int limitUpstreamBytes, int limitDownstreamBytes, String privateKey,
                                    String reducedStartTime, String reducedEndTime, Integer reducedMaxClients,
                                    Integer reducedLimitUpstreamBytes, Integer reducedLimitDownstreamBytes) {
        // validate that:
        // - maxClients is greater than 0
        // - limitUpstreamBytes and limitDownstreamBytes are greater than or equal to 0, with 0 being a valid value
        // - privateKey is not null or empty, empty is still theoretically valid for the tunnel core but not for the conduit
        boolean baseValid = maxClients > 0 && limitUpstreamBytes >= 0 && limitDownstreamBytes >= 0 && privateKey != null && !privateKey.isEmpty();

        // Reduced usage settings are all-or-nothing. The JS layer (Zod schema) enforces this too;
        // keep the native validation as defense-in-depth for persisted or external inputs.
        boolean hasAnyReduced = reducedStartTime != null || reducedEndTime != null || reducedMaxClients != null ||
                reducedLimitUpstreamBytes != null || reducedLimitDownstreamBytes != null;
        boolean hasAllReduced = reducedStartTime != null && reducedEndTime != null && reducedMaxClients != null &&
                reducedLimitUpstreamBytes != null && reducedLimitDownstreamBytes != null;

        if (!baseValid) {
            return false;
        }

        if (!hasAnyReduced) {
            return true;
        }

        if (!hasAllReduced) {
            return false;
        }

        if (!isTimeOfDay(reducedStartTime) || !isTimeOfDay(reducedEndTime)) {
            return false;
        }

        if (reducedStartTime.equals(reducedEndTime)) {
            return false;
        }

        return reducedMaxClients > 0 && reducedLimitUpstreamBytes >= 0 && reducedLimitDownstreamBytes >= 0;
    }

    private static boolean isTimeOfDay(String value) {
        return value != null && value.matches("^([01]\\d|2[0-3]):([0-5]\\d)$");
    }

    private static boolean storeOptionalString(SharedPreferences preferences, SharedPreferences.Editor editor, String key, String value) {
        String storedValue = preferences.getString(key, null);
        if (value == null) {
            if (storedValue != null) {
                editor.remove(key);
                return true;
            }
            return false;
        }
        if (storedValue == null || !storedValue.equals(value)) {
            editor.putString(key, value);
            return true;
        }
        return false;
    }

    private static boolean storeOptionalInt(SharedPreferences preferences, SharedPreferences.Editor editor, String key, Integer value) {
        if (value == null) {
            if (preferences.contains(key)) {
                editor.remove(key);
                return true;
            }
            return false;
        }
        if (!preferences.contains(key) || preferences.getInt(key, -1) != value) {
            editor.putInt(key, value);
            return true;
        }
        return false;
    }

    // Helper to migrate preferences to the current schema
    private static void migrate(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = preferences.edit();
        int storedSchemaVersion = preferences.getInt(SCHEMA_VERSION_KEY, 0);

        while (storedSchemaVersion < CURRENT_SCHEMA_VERSION) {
            switch (storedSchemaVersion) {
                case 0:
                    MyLog.i(TAG, "Migrating schema from version 0 to 1");

                    if (!preferences.contains(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY) && preferences.contains("limitUpstreamBytes")) {
                        editor.putInt(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, preferences.getInt("limitUpstreamBytes", -1));
                        editor.remove("limitUpstreamBytes");
                        MyLog.i(TAG, "Migrated limitUpstreamBytes.");
                    }

                    if (!preferences.contains(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY) && preferences.contains("limitDownstreamBytes")) {
                        editor.putInt(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, preferences.getInt("limitDownstreamBytes", -1));
                        editor.remove("limitDownstreamBytes");
                        MyLog.i(TAG, "Migrated limitDownstreamBytes.");
                    }

                    if (!preferences.contains(PRIVATE_KEY_KEY) && preferences.contains("inProxyPrivateKey")) {
                        editor.putString(PRIVATE_KEY_KEY, preferences.getString("inProxyPrivateKey", null));
                        editor.remove("inProxyPrivateKey");
                        MyLog.i(TAG, "Migrated inProxyPrivateKey.");
                    }

                    // Apply migrations
                    editor.apply();


                    // Update schema version
                    SharedPreferences.Editor schemaEditor = preferences.edit();
                    schemaEditor.putInt(SCHEMA_VERSION_KEY, 1);
                    schemaEditor.apply();
                    MyLog.i(TAG, "Schema version updated to 1.");
                    storedSchemaVersion = 1;
                    break;

                    // To apply future migrations, add a new case like the following:
                    /*
                    case 1:
                        MyLog.i(TAG, "Migrating schema from version 1 to 2");
                        // Add migration logic here
                        // Update schema version
                        SharedPreferences.Editor schemaEditor = preferences.edit();
                        schemaEditor.putInt(SCHEMA_VERSION_KEY, 2);
                        schemaEditor.apply();
                        MyLog.i(TAG, "Schema version updated to 2.");
                        storedSchemaVersion = 2;
                        break;
                     */

                default:
                    throw new IllegalStateException("Unknown schema version: " + storedSchemaVersion);
            }
        }
    }
}
