package ca.psiphon.conduit.nativemodule;

import android.os.Bundle;
import android.os.Parcelable;

import androidx.annotation.NonNull;

import com.google.auto.value.AutoValue;

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

    public static ProxyState serviceDefault() {
        return new AutoValue_ProxyState(Status.RUNNING, NetworkState.HAS_INTERNET);
    }

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

    public abstract Builder toBuilder();

    @AutoValue.Builder
    public static abstract class Builder {
        public abstract Builder setStatus(Status status);

        public abstract Builder setNetworkState(NetworkState networkState);

        public abstract ProxyState build();
    }
}
