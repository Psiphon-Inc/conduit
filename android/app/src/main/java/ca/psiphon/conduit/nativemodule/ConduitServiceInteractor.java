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

import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.IBinder;
import android.os.RemoteException;

import androidx.core.content.ContextCompat;

import com.jakewharton.rxrelay2.BehaviorRelay;
import com.jakewharton.rxrelay2.Relay;

import java.util.List;

import ca.psiphon.conduit.nativemodule.logging.MyLog;
import ca.psiphon.conduit.nativemodule.stats.ProxyActivityStats;
import io.reactivex.BackpressureStrategy;
import io.reactivex.Flowable;

public class ConduitServiceInteractor {
    public static final String MAX_CLIENTS = "maxClients";
    public static final String LIMIT_UPSTREAM_BYTES = "limitUpstreamBytesPerSecond";
    public static final String LIMIT_DOWNSTREAM_BYTES = "limitDownstreamBytesPerSecond";
    public static final String INPROXY_PRIVATE_KEY = "inProxyPrivateKey";

    public static final String SERVICE_STARTING_BROADCAST_PERMISSION = "ca.psiphon.conduit.nativemodule.SERVICE_STARTING_BROADCAST_PERMISSION";
    public static final String SERVICE_STARTING_BROADCAST_INTENT = "ca.psiphon.conduit.nativemodule.SERVICE_STARTING_BROADCAST_INTENT";
    private static final String TAG = ConduitServiceInteractor.class.getSimpleName();
    private final Relay<ProxyState> proxyStateRelay = BehaviorRelay.<ProxyState>create().toSerialized();
    private final Relay<ProxyActivityStats> proxyActivityStatsRelay = BehaviorRelay.<ProxyActivityStats>create()
            .toSerialized();
    private final IConduitClientCallback clientCallback = new IConduitClientCallback.Stub() {
        @Override
        public void onProxyStateUpdated(Bundle proxyStateBundle) {
            ProxyState proxyState = ProxyState.fromBundle(proxyStateBundle);
            proxyStateRelay.accept(proxyState);
        }

        @Override
        public void onProxyActivityStatsUpdated(Bundle proxyActivityStatsBundle) {
            ProxyActivityStats proxyActivityStats = ProxyActivityStats.fromBundle(proxyActivityStatsBundle);
            proxyActivityStatsRelay.accept(proxyActivityStats);
        }
    };
    private final BroadcastReceiver broadcastReceiver;
    private IConduitService conduitService;
    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            conduitService = IConduitService.Stub.asInterface(service);

            try {
                conduitService.registerClient(clientCallback);
            } catch (RemoteException e) {
                MyLog.e(TAG, "Failed to register client" + e);
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            conduitService = null;
            proxyStateRelay.accept(ProxyState.stopped());
            isServiceBound = false;
        }
    };
    private boolean isStopped = true;
    private boolean isServiceBound = false;

    public ConduitServiceInteractor(Context context) {
        IntentFilter intentFilter = new IntentFilter(SERVICE_STARTING_BROADCAST_INTENT);
        this.broadcastReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!isStopped) {
                    bindService(context, new Intent(context, ConduitService.class));
                }
            }
        };
        // Register the broadcast receiver with a custom permission to make sure the broadcast is our own.
        // The permission is defined in the manifest with the signature protection level.
        // Note that we are registering the receiver with the exported flag set to true to be able to receive the broadcast
        // from the service running in a different process.
        ContextCompat.registerReceiver(context, broadcastReceiver, intentFilter, SERVICE_STARTING_BROADCAST_PERMISSION,
                null, ContextCompat.RECEIVER_EXPORTED);

        proxyStateRelay.accept(ProxyState.unknown());
    }

    public static void toggleInProxy(Context context, ConduitServiceParameters conduitServiceParameters) {
        Intent intent = new Intent(context, ConduitService.class);
        intent.setAction(ConduitService.INTENT_ACTION_TOGGLE_IN_PROXY);
        // Add parameters to the intent
        conduitServiceParameters.putIntoIntent(intent);

        // Send the intent to the service to toggle the proxy
        // and let the service handle the logic in onStartCommand
        sendStartCommandToService(context, intent);
    }

    public static void startInProxyWithLastKnownParams(Context context) {
        Intent intent = new Intent(context, ConduitService.class);
        intent.setAction(ConduitService.INTENT_ACTION_START_IN_PROXY_WITH_LAST_PARAMS);
        // Use startForegroundService instead of startService since:
        // 1. When restarting after app upgrade or system reboot from ConduitRestartReceiver,
        //    we must use startForegroundService to start from background, as Android allows this
        //    via ACTION_MY_PACKAGE_REPLACED or ACTION_BOOT_COMPLETED exemptions, see:
        //    https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start#background-start-restriction-exemptions
        //
        // 2. The service will be foreground anyway - it's either already running as foreground
        //    or will promote itself to foreground shortly after starting.
        ContextCompat.startForegroundService(context, intent);
    }

    public static void paramsChanged(Context context, ConduitServiceParameters conduitServiceParameters) {
        Intent intent = new Intent(context, ConduitService.class);
        intent.setAction(ConduitService.INTENT_ACTION_PARAMS_CHANGED);
        // Add parameters to the intent
        conduitServiceParameters.putIntoIntent(intent);

        // Send the intent to the service to update the parameters
        // and let the service handle the logic in onStartCommand
        sendStartCommandToService(context, intent);
    }

    // Internal method to start the ConduitService with the provided intent
    private static void sendStartCommandToService(Context context, Intent intent) {
        // Using startService instead of startForegroundService because the service might need to shut down
        // quickly without ever showing a foreground notification. Calling startForegroundService implies
        // that we must call startForeground() shortly after, but ConduitService handles different types of
        // actions, and sometimes it might determine there's no need to keep running (e.g., shuts down immediately
        // if there's no real work). By using startService, we avoid the requirement to show a notification
        // if the service ends quickly. If it ends up starting the Psiphon tunnel or doing other long-running work,
        // we'll upgrade it to a foreground service at that point.
        context.startService(intent);
    }

    public void onStart(Context context) {
        isStopped = false;
        // Note that the service may be running even if the proxy task is in a stopped state.
        // In this situation, we’ll bind to the service to retrieve the current proxy state,
        // so it’s important to accurately track the proxy state within the service.
        if (isServiceRunning(context)) {
            bindService(context, new Intent(context, ConduitService.class));
        } else {
            proxyStateRelay.accept(ProxyState.stopped());
        }
    }

    public void onStop(Context context) {
        isStopped = true;
        proxyStateRelay.accept(ProxyState.unknown());

        if (conduitService != null) {
            try {
                conduitService.unregisterClient(clientCallback);
            } catch (RemoteException e) {
                MyLog.e(TAG, "Failed to unregister client" + e);
            }
        }
        if (isServiceBound) {
            context.unbindService(serviceConnection);
            isServiceBound = false; // Reset the flag
        }
        conduitService = null;
    }

    public void onDestroy(Context context) {
        context.unregisterReceiver(broadcastReceiver);
    }

    public Flowable<ProxyState> proxyStateFlowable() {
        return proxyStateRelay
                .distinctUntilChanged()
                .toFlowable(BackpressureStrategy.LATEST);
    }

    public Flowable<ProxyActivityStats> proxyActivityStatsFlowable() {
        return proxyActivityStatsRelay
                .distinctUntilChanged()
                .toFlowable(BackpressureStrategy.LATEST);
    }

    private void bindService(Context context, Intent intent) {
        if (!isServiceBound) { // Check if the service is already bound
            isServiceBound = true; // Set the flag as soon as we call bindService
            context.bindService(intent, serviceConnection, 0);
        }
    }

    // Method to check if the service is running
    public boolean isServiceRunning(Context context) {
        ActivityManager activityManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        if (activityManager == null) {
            return false;
        }

        List<ActivityManager.RunningServiceInfo> services = activityManager.getRunningServices(Integer.MAX_VALUE);
        for (ActivityManager.RunningServiceInfo serviceInfo : services) {
            if (ConduitService.class.getName().equals(serviceInfo.service.getClassName())) {
                return true;
            }
        }
        return false;
    }
}
