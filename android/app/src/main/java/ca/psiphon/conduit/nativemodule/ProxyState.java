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

import android.os.Bundle;
import android.os.Parcelable;

import androidx.annotation.NonNull;

import com.google.auto.value.AutoValue;

import org.json.JSONException;
import org.json.JSONObject;



@AutoValue
public abstract class ProxyState implements Parcelable {

    public enum Status {
        RUNNING,
        STOPPED,
        UNKNOWN,
    }

    public enum NetworkState {
        HAS_INTERNET,
        NO_INTERNET,
    }

    @NonNull
    public abstract Status status();

    @NonNull
    public abstract NetworkState networkState();

    public static ProxyState unknown() {
        return new AutoValue_ProxyState(Status.UNKNOWN, NetworkState.HAS_INTERNET);
    }

    public static ProxyState stopped() {
        return new AutoValue_ProxyState(Status.STOPPED, NetworkState.HAS_INTERNET);
    }

    public boolean isRunning() {
        return Status.RUNNING.equals(status());
    }

    public boolean isUnknown() {
        return Status.UNKNOWN.equals(status());
    }

    public boolean isStopped() {
        return Status.STOPPED.equals(status());
    }

    public Bundle toBundle() {
        Bundle bundle = new Bundle();
        bundle.putParcelable("proxy_state", this);
        return bundle;
    }

    public static ProxyState fromBundle(Bundle bundle) {
        bundle.setClassLoader(AutoValue_ProxyState.class.getClassLoader());
        return bundle.getParcelable("proxy_state");
    }

    public String toJson() throws JSONException {
        JSONObject json = new JSONObject();
        json.put("status", status().name());
        json.put("networkState", networkState().name());
        return json.toString();
    }

    public abstract Builder toBuilder();

    @AutoValue.Builder
    public static abstract class Builder {
        public abstract Builder setStatus(Status status);

        public abstract Builder setNetworkState(NetworkState networkState);

        public abstract ProxyState build();
    }
}
