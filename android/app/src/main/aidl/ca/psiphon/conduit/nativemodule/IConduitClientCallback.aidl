package ca.psiphon.conduit.nativemodule;

import android.os.Bundle;

interface IConduitClientCallback {
    void onProxyStateUpdated(in Bundle proxyStateBundle);
    void onProxyActivityStatsUpdated(in Bundle proxyActivityStatsBundle);
    void ping();
}
