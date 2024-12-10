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

public record ConduitServiceParameters(int maxClients, int limitUpstreamBytes, int limitDownstreamBytes, String privateKey, boolean personalPairingEnabled, String compartmentId) {
    public static String TAG = ConduitServiceParameters.class.getSimpleName();

    // Keys and preferences file name
    public static final String PREFS_NAME = "ConduitServiceParamsPrefs";
    public static final String MAX_CLIENTS_KEY = "maxClients";
    public static final String LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY = "limitUpstreamBytesPerSecond";
    public static final String LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY = "limitDownstreamBytesPerSecond";
    public static final String PRIVATE_KEY_KEY = "privateKey";
    public static final String PERSONAL_PAIRING_ENABLED_KEY = "personalPairingEnabled";
    public static final String COMPARTMENT_ID_KEY = "compartmentId";

    public static final String SCHEMA_VERSION_KEY = "schemaVersion";

    // Current storage schema version
    private static final int CURRENT_SCHEMA_VERSION = 1;

    // Parse method for ReadableMap
    public static ConduitServiceParameters parse(ReadableMap map) {
        // Check if all keys are present
        if (!map.hasKey(MAX_CLIENTS_KEY) ||
                !map.hasKey(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY) ||
                !map.hasKey(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY) ||
                !map.hasKey(PRIVATE_KEY_KEY) ||
                !map.hasKey(PERSONAL_PAIRING_ENABLED_KEY) ||
                !map.hasKey(COMPARTMENT_ID_KEY)) {
            return null;
        }

        int maxClients = map.getInt(MAX_CLIENTS_KEY);
        int limitUpstreamBytes = map.getInt(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY);
        int limitDownstreamBytes = map.getInt(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY);
        String proxyPrivateKey = map.getString(PRIVATE_KEY_KEY);
        boolean personalPairingEnabled = map.getBoolean(PERSONAL_PAIRING_ENABLED_KEY);
        String compartmentId = map.getString(COMPARTMENT_ID_KEY);

        // Validate parsed values
        if (validate(maxClients, limitUpstreamBytes, limitDownstreamBytes, proxyPrivateKey, compartmentId)) {
            return new ConduitServiceParameters(maxClients, limitUpstreamBytes, limitDownstreamBytes, proxyPrivateKey, personalPairingEnabled, compartmentId);
        }

        return null;
    }

    // Parse method for Intent
    public static ConduitServiceParameters parse(Intent intent) {
        // Check if all keys are present
        if (!intent.hasExtra(MAX_CLIENTS_KEY) ||
                !intent.hasExtra(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY) ||
                !intent.hasExtra(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY) ||
                !intent.hasExtra(PRIVATE_KEY_KEY) ||
                !intent.hasExtra(PERSONAL_PAIRING_ENABLED_KEY) ||
                !intent.hasExtra(COMPARTMENT_ID_KEY)) {
            return null;
        }

        int maxClients = intent.getIntExtra(MAX_CLIENTS_KEY, -1);
        int limitUpstreamBytes = intent.getIntExtra(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, -1);
        int limitDownstreamBytes = intent.getIntExtra(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, -1);
        String proxyPrivateKey = intent.getStringExtra(PRIVATE_KEY_KEY);
        boolean personalPairingEnabled = intent.getBooleanExtra(PERSONAL_PAIRING_ENABLED_KEY, false);
        String compartmentId = intent.getStringExtra(COMPARTMENT_ID_KEY);

        // Validate parsed values
        if (validate(maxClients, limitUpstreamBytes, limitDownstreamBytes, proxyPrivateKey, compartmentId)) {
            return new ConduitServiceParameters(maxClients, limitUpstreamBytes, limitDownstreamBytes, proxyPrivateKey, personalPairingEnabled, compartmentId);
        }

        return null;
    }

    // Store the object in SharedPreferences and return true if any values changed
    public boolean store(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
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

        if (preferences.getBoolean(PERSONAL_PAIRING_ENABLED_KEY, false) != personalPairingEnabled) {
            editor.putBoolean(PERSONAL_PAIRING_ENABLED_KEY, personalPairingEnabled);
            changed = true;
        }

        if (preferences.getString(COMPARTMENT_ID_KEY, null) != compartmentId) {
            editor.putString(COMPARTMENT_ID_KEY, compartmentId);
            changed = true;
        }

        // Guard against NPE
        String storedPrivateKey = preferences.getString(PRIVATE_KEY_KEY, null);
        if (storedPrivateKey == null || !storedPrivateKey.equals(privateKey)) {
            editor.putString(PRIVATE_KEY_KEY, privateKey);
            changed = true;
        }

        if (changed) {
            editor.apply();
        }

        return changed;
    }

    // Helper to load parameters from preferences
    public static ConduitServiceParameters load(Context context) {
        migrate(context); // Ensure preferences are up-to-date

        SharedPreferences preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        int maxClients = preferences.getInt(MAX_CLIENTS_KEY, -1);
        int limitUpstreamBytes = preferences.getInt(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, -1);
        int limitDownstreamBytes = preferences.getInt(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, -1);
        String proxyPrivateKey = preferences.getString(PRIVATE_KEY_KEY, null);
        boolean personalPairingEnabled = preferences.getBoolean(PERSONAL_PAIRING_ENABLED_KEY, false);
        String compartmentId = preferences.getString(COMPARTMENT_ID_KEY, null);

        // Validate the loaded parameters
        if (validate(maxClients, limitUpstreamBytes, limitDownstreamBytes, proxyPrivateKey, compartmentId)) {
            return new ConduitServiceParameters(maxClients, limitUpstreamBytes, limitDownstreamBytes, proxyPrivateKey, personalPairingEnabled, compartmentId);
        }

        return null;
    }

    // Helper to put parameters into an intent
    public void putIntoIntent(Intent intent) {
        intent.putExtra(MAX_CLIENTS_KEY, maxClients);
        intent.putExtra(LIMIT_UPSTREAM_BYTES_PER_SECOND_KEY, limitUpstreamBytes);
        intent.putExtra(LIMIT_DOWNSTREAM_BYTES_PER_SECOND_KEY, limitDownstreamBytes);
        intent.putExtra(PRIVATE_KEY_KEY, privateKey);
        intent.putExtra(PERSONAL_PAIRING_ENABLED_KEY, personalPairingEnabled);
        intent.putExtra(COMPARTMENT_ID_KEY, compartmentId);
    }

    // Helper to validate parameters
    private static boolean validate(int maxClients, int limitUpstreamBytes, int limitDownstreamBytes, String privateKey, String compartmentId) {
        // validate that:
        // - maxClients is greater than 0
        // - limitUpstreamBytes and limitDownstreamBytes are greater than or equal to 0, with 0 being a valid value
        // - privateKey is not null or empty, empty is still theoretically valid for the tunnel core but not for the conduit
        // - compartmentId is not null or empty, empty is still theoretically valid, but we expect it to be set by the UI
        return maxClients > 0 && limitUpstreamBytes >= 0 && limitDownstreamBytes >= 0 && privateKey != null && !privateKey.isEmpty() && compartmentId != null && !compartmentId.isEmpty();
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
