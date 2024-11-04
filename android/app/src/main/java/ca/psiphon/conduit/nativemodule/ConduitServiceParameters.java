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
import android.content.SharedPreferences;

import java.util.HashMap;
import java.util.Map;

public class ConduitServiceParameters {
    static final String MAX_CLIENTS_KEY = "maxClients";
    static final String LIMIT_UPSTREAM_BYTES_KEY = "limitUpstreamBytes";
    static final String LIMIT_DOWNSTREAM_BYTES_KEY = "limitDownstreamBytes";
    static final String INPROXY_PRIVATE_KEY_KEY = "inProxyPrivateKey";
    private static final String PREFS_NAME = "ConduitServiceParamsPrefs";

    private final SharedPreferences preferences;

    public ConduitServiceParameters(Context context) {
        this.preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public int getMaxClients() {
        return preferences.getInt(MAX_CLIENTS_KEY, -1);
    }

    public int getLimitUpstreamBytes() {
        return preferences.getInt(LIMIT_UPSTREAM_BYTES_KEY, -1);
    }

    public int getLimitDownstreamBytes() {
        return preferences.getInt(LIMIT_DOWNSTREAM_BYTES_KEY, -1);
    }

    public String getProxyPrivateKey() {
        return preferences.getString(INPROXY_PRIVATE_KEY_KEY, null);
    }

    public boolean updateParametersFromMap(Map<String, Object> params) {
        boolean paramsChanged = false;
        SharedPreferences.Editor editor = preferences.edit();

        if (params.containsKey(MAX_CLIENTS_KEY)) {
            Integer maxClients = (Integer) params.get(MAX_CLIENTS_KEY);
            if (maxClients != null && maxClients != getMaxClients()) {
                editor.putInt(MAX_CLIENTS_KEY, maxClients);
                paramsChanged = true;
            }
        }

        if (params.containsKey(LIMIT_UPSTREAM_BYTES_KEY)) {
            Integer limitUpstreamBytes = (Integer) params.get(LIMIT_UPSTREAM_BYTES_KEY);
            if (limitUpstreamBytes != null && limitUpstreamBytes != getLimitUpstreamBytes()) {
                editor.putInt(LIMIT_UPSTREAM_BYTES_KEY, limitUpstreamBytes);
                paramsChanged = true;
            }
        }

        if (params.containsKey(LIMIT_DOWNSTREAM_BYTES_KEY)) {
            Integer limitDownstreamBytes = (Integer) params.get(LIMIT_DOWNSTREAM_BYTES_KEY);
            if (limitDownstreamBytes != null && limitDownstreamBytes != getLimitDownstreamBytes()) {
                editor.putInt(LIMIT_DOWNSTREAM_BYTES_KEY, limitDownstreamBytes);
                paramsChanged = true;
            }
        }

        if (params.containsKey(INPROXY_PRIVATE_KEY_KEY)) {
            String privateKey = (String) params.get(INPROXY_PRIVATE_KEY_KEY);
            if (privateKey != null && !privateKey.equals(getProxyPrivateKey())) {
                editor.putString(INPROXY_PRIVATE_KEY_KEY, privateKey);
                paramsChanged = true;
            }
        }

        if (paramsChanged) {
            editor.apply();
        }

        return paramsChanged;
    }

    public boolean validateParameters() {
        return getMaxClients() != -1 ||
                getLimitUpstreamBytes() != -1 ||
                getLimitDownstreamBytes() != -1 ||
                getProxyPrivateKey() != null;
    }

    public Map<String, Object> loadLastKnownParameters() {
        Map<String, Object> params = new HashMap<>();
        params.put(MAX_CLIENTS_KEY, getMaxClients());
        params.put(LIMIT_UPSTREAM_BYTES_KEY, getLimitUpstreamBytes());
        params.put(LIMIT_DOWNSTREAM_BYTES_KEY, getLimitDownstreamBytes());
        params.put(INPROXY_PRIVATE_KEY_KEY, getProxyPrivateKey());
        return params;
    }
}
