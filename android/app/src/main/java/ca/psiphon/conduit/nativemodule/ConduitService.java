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
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.content.res.Resources;
import android.os.Build;
import android.os.Bundle;
import android.os.DeadObjectException;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.RemoteException;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

import ca.psiphon.PsiphonTunnel;
import ca.psiphon.conduit.R;
import ca.psiphon.conduit.nativemodule.logging.MyLog;
import ca.psiphon.conduit.nativemodule.stats.ProxyActivityStats;

public class ConduitService extends Service implements PsiphonTunnel.HostService {
    private static final String TAG = ConduitService.class.getSimpleName();

    public static final String INTENT_ACTION_STOP_SERVICE = "ca.psiphon.conduit.nativemodule.StopService";
    public static final String INTENT_ACTION_TOGGLE_IN_PROXY = "ca.psiphon.conduit.nativemodule.ToggleInProxy";
    public static final String INTENT_ACTION_START_IN_PROXY_WITH_LAST_PARAMS = "ca.psiphon.conduit.nativemodule.StartInProxyWithLastParams";
    public static final String INTENT_ACTION_PARAMS_CHANGED = "ca.psiphon.conduit.nativemodule.ParamsChanged";
    public static final String INTENT_ACTION_PSIPHON_START_FAILED = "ca.psiphon.conduit.nativemodule.PsiphonStartFailed";
    public static final String INTENT_ACTION_PSIPHON_RESTART_FAILED = "ca.psiphon.conduit.nativemodule.PsiphonRestartFailed";
    public static final String INTENT_ACTION_INPROXY_MUST_UPGRADE = "ca.psiphon.conduit.nativemodule.InProxyMustUpgrade";

    private final String NOTIFICATION_CHANNEL_ID = "ConduitServiceChannel";

    // Lock to synchronize access to the clients list
    private final Object clientsLock = new Object();

    // Enum to represent the state of the foreground service
    // This tracks the lifecycle of the service in foreground, whether it is
    // running a foreground task (e.g., in-proxy) or transitioning between states.
    private enum ForegroundServiceState {
        STOPPED,
        STARTING,
        RUNNING,
        STOPPING
    }

    // Variable to track the current state of the foreground service
    private final AtomicReference<ForegroundServiceState> foregroundServiceState = new AtomicReference<>(ForegroundServiceState.STOPPED);

    // List to hold the registered clients
    private final List<IConduitClientCallback> clients = new ArrayList<>();


    // PsiphonTunnel instance
    private final PsiphonTunnel psiphonTunnel = PsiphonTunnel.newPsiphonTunnel(this);

    // ExecutorService for running the Psiphon in-proxy task
    private final ExecutorService executorService = Executors.newSingleThreadExecutor();

    private final Handler handler = new Handler(Looper.getMainLooper());

    // AIDL binder implementation
    private final IConduitService.Stub binder = new IConduitService.Stub() {
        @Override
        public void registerClient(IConduitClientCallback client) {
            synchronized (clientsLock) {
                if (client != null && !clients.contains(client)) {
                    clients.add(client);

                    // Also update the client immediately with the current state and stats
                    // Send state
                    try {
                        client.onProxyStateUpdated(proxyState.toBundle());
                    } catch (RemoteException e) {
                        MyLog.e(TAG, "Failed to send proxy state update to client: " + e);
                    }

                    // Send stats
                    try {
                        client.onProxyActivityStatsUpdated(proxyActivityStats.toBundle());
                    } catch (RemoteException e) {
                        MyLog.e(TAG, "Failed to send proxy activity stats update to client: " + e);
                    }
                }
            }
        }

        @Override
        public void unregisterClient(IConduitClientCallback client) {
            synchronized (clientsLock) {
                if (client != null) {
                    clients.remove(client);
                }
            }
        }
    };

    // Proxy activity stats object
    private ProxyActivityStats proxyActivityStats = new ProxyActivityStats();

    // CountDownLatch to signal the in-proxy task to stop
    private CountDownLatch stopLatch;

    // Track current proxy state, note that a client may bind to the service at any time
    // and request the current proxy state so it is important to keep this up to date
    private ProxyState proxyState = ProxyState.stopped();

    @Override
    public Context getContext() {
        return this;
    }

    @Override
    public String getPsiphonConfig() {
         // Load conduit parameters from shared preferences
        ConduitServiceParameters conduitServiceParameters = ConduitServiceParameters.load(getApplicationContext());

        if (conduitServiceParameters == null) {
            // Log the error and crash the app
            MyLog.e(TAG, "Failed to load conduit parameters from shared preferences");
            throw new IllegalStateException("Failed to load conduit parameters from shared preferences");
        }

        // Read the psiphon config from raw res file named psiphon_config
        String psiphonConfigString;
        try {
            psiphonConfigString = Utils.readRawResourceFileAsString(this, R.raw.psiphon_config);
        } catch (IOException | Resources.NotFoundException e) {
            // Log the error and crash the app
            MyLog.e(TAG, "Failed to read psiphon config file" + e);
            throw new RuntimeException(e);
        }
        // Convert to json object
        try {
            JSONObject psiphonConfig = new JSONObject(psiphonConfigString);

            // Enable inproxy mode
            psiphonConfig.put("InproxyEnableProxy", true);

            // Disable tunnels
            psiphonConfig.put("DisableTunnels", true);

            // Disable local proxies
            psiphonConfig.put("DisableLocalHTTPProxy", true);
            psiphonConfig.put("DisableLocalSocksProxy", true);

            // Disable bytes transferred notices
            psiphonConfig.put("EmitBytesTransferred", false);

            // Enable inproxy activity notices
            psiphonConfig.put("EmitInproxyProxyActivity", true);

            // Psiphon client version
            PackageInfo packageInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            psiphonConfig.put("ClientVersion", String.valueOf(packageInfo.versionCode));

            // Set up data root directory
            File dataRootDirectory = ConduitModule.dataRootDirectory(this);
            psiphonConfig.put("DataRootDirectory", dataRootDirectory.getAbsolutePath());

            // Set up notice files
            psiphonConfig.put("UseNoticeFiles", new JSONObject()
                    .put("RotatingFileSize", Constants.HALF_MB)
                    .put("RotatingSyncFrequency", 0));

            // Set inproxy parameters that we stored in shared preferences earlier
            // We trust that the parameters are valid as they were validated when they were loaded in the beginning of this method
            psiphonConfig.put("InproxyProxySessionPrivateKey", conduitServiceParameters.privateKey());

            psiphonConfig.put("InproxyMaxClients", conduitServiceParameters.maxClients());

            psiphonConfig.put("InproxyLimitUpstreamBytesPerSecond", conduitServiceParameters.limitUpstreamBytes());

            psiphonConfig.put("InproxyLimitDownstreamBytesPerSecond", conduitServiceParameters.limitDownstreamBytes());

            // Convert back to json string
            return psiphonConfig.toString();
        } catch (JSONException | PackageManager.NameNotFoundException e) {
            // Log the error and crash the app
            MyLog.e(TAG, "Failed to parse psiphon config: " + e);
            throw new IllegalStateException(e);
        }
    }

    @Override
    public void onInproxyProxyActivity(int connectingClients, int connectedClients, long bytesUp, long bytesDown) {
        handler.post(() -> {
            proxyActivityStats.add(bytesUp, bytesDown, connectingClients, connectedClients);
            updateProxyActivityStats();
        });
    }

    @Override
    public void onInproxyMustUpgrade() {
        handler.post(() -> {
            deliverIntent(getPendingIntent(getContext(), INTENT_ACTION_INPROXY_MUST_UPGRADE),
                    R.string.notification_conduit_inproxy_must_upgrade_text,
                    R.id.notification_id_inproxy_must_upgrade
            );

            // Also, stop the service
            stopForegroundService();
        });
    }

    @Override
    public void onStartedWaitingForNetworkConnectivity() {
        MyLog.i(TAG, "Started waiting for network connectivity");
        handler.post(() -> {
            proxyState = proxyState.toBuilder()
                    .setNetworkState(ProxyState.NetworkState.NO_INTERNET)
                    .build();
            updateProxyState();
        });
    }

    @Override
    public void onStoppedWaitingForNetworkConnectivity() {
        MyLog.i(TAG, "Stopped waiting for network connectivity");
        handler.post(() -> {
            proxyState = proxyState.toBuilder()
                    .setNetworkState(ProxyState.NetworkState.HAS_INTERNET)
                    .build();
            updateProxyState();
        });
    }

    @Override
    public void onApplicationParameters(@NonNull Object o) {
        // TODO: implement when we have a use case
        MyLog.i(TAG, "Received application parameters: " + o);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        MyLog.init(getApplicationContext());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        synchronized (this) {
            return switch (action) {
                case INTENT_ACTION_STOP_SERVICE -> handleStopAction();
                case INTENT_ACTION_TOGGLE_IN_PROXY -> handleToggleAction(intent);
                case INTENT_ACTION_PARAMS_CHANGED -> handleParamsChangedAction(intent);
                case INTENT_ACTION_START_IN_PROXY_WITH_LAST_PARAMS -> handleStartInProxyWithLastParamsAction();
                default -> {
                    MyLog.w(TAG, "Unknown action received: " + action);
                    stopSelf();
                    yield START_NOT_STICKY;
                }
            };
        }
    }

    private int handleStopAction() {
        MyLog.i(TAG, "Received stop action from notification.");
        ForegroundServiceState state = foregroundServiceState.get();
        if (state == ForegroundServiceState.STOPPING) {
            MyLog.i(TAG, "Stop action ignored; service already stopping.");
        } else if (state == ForegroundServiceState.RUNNING || state == ForegroundServiceState.STARTING) {
            Utils.setServiceRunningFlag(this, false);
            stopForegroundService();
        } else {
            MyLog.i(TAG, "Stop action ignored; service not running.");
        }
        return START_NOT_STICKY;
    }

    private int handleToggleAction(Intent intent) {
        MyLog.i(TAG, "Received toggle action");
        ForegroundServiceState state = foregroundServiceState.get();
        switch (state) {
            case RUNNING -> {
                MyLog.i(TAG, "Service is running; toggling off.");
                Utils.setServiceRunningFlag(this, false);
                stopForegroundService();
                return START_NOT_STICKY;
            }
            case STOPPED -> {
                MyLog.i(TAG, "Service is not running; starting with new parameters.");

                // Parse the parameters from the intent
                ConduitServiceParameters conduitServiceParameters = ConduitServiceParameters.parse(intent);
                if (conduitServiceParameters == null) {
                    MyLog.e(TAG, "Attempted to start service with invalid parameters, crashing the app.");
                    throw new IllegalStateException("Invalid parameters received");
                }

                // Store the parameters
                conduitServiceParameters.store(getApplicationContext());

                // Start the service
                startForegroundService();

                return START_REDELIVER_INTENT;
            }
            case STARTING, STOPPING -> {
                MyLog.i(TAG, "Service is in an intermediate state; toggle action ignored.");
                return START_NOT_STICKY;
            }
            default -> {
                MyLog.w(TAG, "Unexpected service state: " + state);
                return START_NOT_STICKY;
            }
        }
    }

    private int handleParamsChangedAction(Intent intent) {
        ForegroundServiceState state = foregroundServiceState.get();

        // Parse the parameters from the intent
        ConduitServiceParameters conduitServiceParameters = ConduitServiceParameters.parse(intent);

        // If the parameters are invalid, crash the app
        if (conduitServiceParameters == null) {
            MyLog.e(TAG, "Attempted to update parameters with invalid parameters, crashing the app.");
            throw new IllegalStateException("Invalid parameters received");
        }

        // Update and persist parameters, storing whether changes occurred
        boolean paramsUpdated = conduitServiceParameters.store(getApplicationContext());
        MyLog.i(TAG, paramsUpdated ? "Parameters updated; changes persisted." : "Parameters update called, but no changes detected.");

        // If the service is in the STOPPED state, stop it to prevent it from running unnecessarily
        if (state == ForegroundServiceState.STOPPED) {
            stopSelf();
        } else if (paramsUpdated && state == ForegroundServiceState.RUNNING) {
            // Restart if parameters were updated and the service is running
            MyLog.i(TAG, "Service is running; restarting psiphonTunnel due to parameter changes.");
            try {
                // Reset proxy activity stats before restart
                proxyActivityStats = new ProxyActivityStats();
                psiphonTunnel.restartPsiphon();

                // Update clients with reset proxy activity stats
                updateProxyActivityStats();

            } catch (PsiphonTunnel.Exception e) {
                MyLog.e(TAG, "Failed to restart psiphon: " + e);

                // Stop foreground service if restart failed
                stopForegroundService();

                // Prepare and deliver failure notification
                Bundle extras = new Bundle();
                extras.putString("errorMessage", e.getMessage());
                deliverIntent(getPendingIntent(getContext(), INTENT_ACTION_PSIPHON_RESTART_FAILED, extras),
                        R.string.notification_conduit_failed_to_restart_text,
                        R.id.notification_id_error_psiphon_restart_failed
                );
            }
        }

        return START_NOT_STICKY;
    }

    private int handleStartInProxyWithLastParamsAction() {
        ForegroundServiceState state = foregroundServiceState.get();
        if (state == ForegroundServiceState.STOPPED) {
            MyLog.i(TAG, "Service is stopped; starting with last known parameters.");
            // Validate the last known parameters before starting the service
            ConduitServiceParameters conduitServiceParameters = ConduitServiceParameters.load(getApplicationContext());
            if (conduitServiceParameters == null) {
                MyLog.e(TAG, "Failed to load conduit parameters from shared preferences; will not start service.");
                return START_NOT_STICKY;
            }
            startForegroundService();
            return START_REDELIVER_INTENT;
        } else {
            MyLog.i(TAG, "Service is not stopped; ignoring start with last parameters action.");
            return START_NOT_STICKY;
        }
    }

    private synchronized void startForegroundService() {
        if (!foregroundServiceState.compareAndSet(ForegroundServiceState.STOPPED, ForegroundServiceState.STARTING)) {
            MyLog.i(TAG, "Service is not stopped; cannot start.");
            return;
        }

        MyLog.i(TAG, "Starting in-proxy.");

        // Also persist the service running flag
        Utils.setServiceRunningFlag(this, true);

        // Clear error notifications before starting the service
        cancelErrorNotifications();

        // Notify all ConduitServiceInteractor instances that the service is starting so they bind to exchange messages
        // with the service and receive tunnel state updates.
        Intent serviceStartingBroadcastIntent = new Intent(ConduitServiceInteractor.SERVICE_STARTING_BROADCAST_INTENT);
        // Only allow apps with the permission to receive the broadcast. The permission is defined in the manifest with
        // "signature" protection level as following:
        // <permission android:name="ca.psiphon.conduit.nativemodule.SERVICE_STARTING_BROADCAST_PERMISSION" android:protectionLevel="signature" />
        sendBroadcast(serviceStartingBroadcastIntent, ConduitServiceInteractor.SERVICE_STARTING_BROADCAST_PERMISSION);


        // Prepare for showing the service state notification

        // Notification channel name
        final String CHANNEL_NAME = getString(R.string.app_name);

        // Create a NotificationManager to manage the notification
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        // Create a NotificationChannel for Android 8.0+ (Oreo)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(NOTIFICATION_CHANNEL_ID, CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription(getString(R.string.conduit_service_channel_description));
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }

        // Start the service in the foreground with a notification.
        Notification startingNotification = buildNotification(R.drawable.ic_conduit_active,
                getString(R.string.conduit_service_starting_notification_text),
                getString(R.string.conduit_service_starting_notification_text));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceCompat.startForeground(this, R.id.notification_id_proxy_state, startingNotification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            ServiceCompat.startForeground(this, R.id.notification_id_proxy_state, startingNotification,
                    0 /* ServiceInfo.FOREGROUND_SERVICE_TYPE_NONE */);
        }

        // Start the in-proxy task
        //
        // Initialize the CountDownLatch for stopping the thread
        stopLatch = new CountDownLatch(1);

        // Start the proxy task using ExecutorService
        executorService.submit(() -> {
            // reset the proxy activity stats
            proxyActivityStats = new ProxyActivityStats();
            try {
                MyLog.i(TAG, "In-proxy task started.");
                proxyState = proxyState.toBuilder()
                        .setStatus(ProxyState.Status.RUNNING)
                        .build();
                updateProxyState();

                psiphonTunnel.startTunneling(Utils.getEmbeddedServers(this));

                // Wait until signaled to stop
                stopLatch.await();
                MyLog.i(TAG, "In-proxy task stopping.");
            } catch (PsiphonTunnel.Exception e) {
                MyLog.e(TAG, "Failed to start in-proxy: " + e);
                String errorMessage = e.getMessage();

                final Bundle extras = new Bundle();
                extras.putString("errorMessage", errorMessage);

                deliverIntent(getPendingIntent(getContext(), INTENT_ACTION_PSIPHON_START_FAILED, extras),
                        R.string.notification_conduit_failed_to_start_text,
                        R.id.notification_id_error_psiphon_start_failed
                );

            } catch (InterruptedException e) {
                MyLog.e(TAG, "In-proxy task interrupted: " + e);
                Thread.currentThread().interrupt();
            } finally {
                psiphonTunnel.stop();
                MyLog.i(TAG, "In-proxy task stopped.");

                // Cleanup and stop the service
                stopForeground(true);
                stopSelf();

                // Set the proxy and service state to STOPPED
                // This is not strictly necessary as the service is stopping, but it is good practice
                proxyState = proxyState.toBuilder()
                        .setStatus(ProxyState.Status.STOPPED)
                        .build();
                foregroundServiceState.set(ForegroundServiceState.STOPPED);
            }
        });

        // Update the service state to RUNNING after starting the task
        foregroundServiceState.set(ForegroundServiceState.RUNNING);
    }

    private synchronized void stopForegroundService() {
        if (!foregroundServiceState.compareAndSet(ForegroundServiceState.RUNNING, ForegroundServiceState.STOPPING)) {
            MyLog.i(TAG, "Service is not running; cannot stop.");
            return;
        }

        MyLog.i(TAG, "Stopping the foreground service.");

        // Signal the task to stop
        if (stopLatch != null) {
            stopLatch.countDown();
        }
    }

    private Notification notificationForProxyState(ProxyState proxyState, ProxyActivityStats proxyActivityStats) {
        int notificationIconId;
        CharSequence notificationTextShort;
        CharSequence notificationTextLong;

        // Handle the no internet state first
        ProxyState.NetworkState networkState = proxyState.networkState();
        if (networkState == ProxyState.NetworkState.NO_INTERNET) {
            notificationIconId = R.drawable.ic_conduit_no_internet;
            notificationTextShort = notificationTextLong = getString(R.string.conduit_service_no_internet_notification_text);
        } else {
            notificationIconId = R.drawable.ic_conduit_active;

            long dataTransferred = proxyActivityStats.getTotalBytesUp() + proxyActivityStats.getTotalBytesDown();
            int connectingClients = proxyActivityStats.getCurrentConnectingClients();
            int connectedClients = proxyActivityStats.getCurrentConnectedClients();

            notificationTextShort = getString(R.string.conduit_service_running_notification_short_text,
                    connectedClients,     // Connected clients
                    connectingClients,    // Connecting clients
                    Utils.formatBytes(dataTransferred, true));    // Data transferred, formatted in SI units
            notificationTextLong = getString(R.string.conduit_service_running_notification_long_text,
                    connectedClients,     // Connected clients
                    connectingClients,    // Connecting clients
                    Utils.formatBytes(dataTransferred, true));    // Data transferred, formatted in SI units
        }
        return buildNotification(notificationIconId, notificationTextShort, notificationTextLong);
    }

    private Notification buildNotification(int notificationIconId, CharSequence notificationTextShort, CharSequence notificationTextLong) {
        Intent stopServiceIntent = new Intent(this, getClass());
        stopServiceIntent.setAction(INTENT_ACTION_STOP_SERVICE);

        PendingIntent stopTunnelPendingIntent = PendingIntent.getService(getApplicationContext(), 0, stopServiceIntent,
                PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Action notificationAction = new NotificationCompat.Action.Builder(
                R.drawable.ic_conduit_stop_service,
                getString(R.string.conduit_service_stop_label_text),
                stopTunnelPendingIntent)
                .build();

        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID);

        return notificationBuilder
                .setSmallIcon(notificationIconId)
                .setContentTitle(getText(R.string.app_name))
                .setContentText(notificationTextShort)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(notificationTextLong))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(getPendingIntent(this, Intent.ACTION_VIEW))
                .addAction(notificationAction)
                .setOngoing(true)
                .build();
    }

    private PendingIntent getPendingIntent(Context ctx, final String actionString) {
        return getPendingIntent(ctx, actionString, null);
    }

    private PendingIntent getPendingIntent(Context ctx, final String actionString, final Bundle extras) {
        Intent intent = new Intent();
        try {
            PackageManager pm = getPackageManager();
            PackageInfo packageInfo = pm.getPackageInfo(this.getPackageName(), 0);
            ComponentName componentName = new ComponentName(packageInfo.packageName,
                    packageInfo.packageName + ".TunnelIntentsProxy");
            intent.setComponent(componentName);
        } catch (PackageManager.NameNotFoundException ignored) {
        }
        intent.setAction(actionString);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        if (extras != null) {
            intent.putExtras(extras);
        }

        return PendingIntent.getActivity(ctx, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void deliverIntent(PendingIntent pendingIntent, int messageId, int notificationId) {
        // For pre-29 devices, we rely on the behavior that sending an intent will bring the activity
        // to the foreground even if it's currently backgrounded. For API 29+, we use isAppInForeground
        // to determine if there's an active foreground activity before deciding to send the intent or
        // show a notification instead.
        if (Build.VERSION.SDK_INT < 29 || isAppInForeground(getApplicationContext())) {
            try {
                pendingIntent.send(getContext(), 0, null);
            } catch (PendingIntent.CanceledException e) {
                showErrorNotification(pendingIntent, messageId, notificationId);
            }
        } else {
            showErrorNotification(pendingIntent, messageId, notificationId);
        }
    }

    private boolean isAppInForeground(Context context) {
        ActivityManager activityManager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        List<ActivityManager.RunningTaskInfo> taskInfo = activityManager.getRunningTasks(1);
        if (taskInfo != null && !taskInfo.isEmpty()) {
            ComponentName topActivity = taskInfo.get(0).topActivity;
            return topActivity != null && topActivity.getPackageName().equals(context.getPackageName());
        }
        return false;
    }

    private void showErrorNotification(PendingIntent pendingIntent, int messageId, int notificationId) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) {
            return;
        }

        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(getContext(),
                NOTIFICATION_CHANNEL_ID);
        notificationBuilder
                .setSmallIcon(R.drawable.ic_conduit_error)
                .setContentTitle(getText(R.string.app_name))
                .setContentText(getString(messageId))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(getString(messageId)))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);
        notificationManager.notify(notificationId, notificationBuilder.build());
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        executorService.shutdownNow();
        // Cancel proxy state notification
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.cancel(R.id.notification_id_proxy_state);
        }
    }

    private void cancelErrorNotifications() {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) {
            return;
        }
        notificationManager.cancel(R.id.notification_id_error_psiphon_start_failed);
        notificationManager.cancel(R.id.notification_id_error_psiphon_restart_failed);
        notificationManager.cancel(R.id.notification_id_inproxy_must_upgrade);
    }


    // Unified method to send updates to all registered clients
    // This method is synchronized to avoid concurrent modification of the clients list when called from multiple threads
    private void notifyClients(ClientNotifier notifier) {
        synchronized (clientsLock) {
            for (Iterator<IConduitClientCallback> iterator = clients.iterator(); iterator.hasNext(); ) {
                IConduitClientCallback client = iterator.next();
                try {
                    notifier.notify(client);
                } catch (RemoteException e) {
                    // Remove the client if it is dead and do not log the exception as it is expected
                    // to happen when a client goes away without unregistering.
                    if (e instanceof DeadObjectException) {
                        iterator.remove();
                    } else {
                        MyLog.e(TAG, "Failed to notify client: " + e);
                    }
                }
            }
        }
    }

    public void updateProxyState() {
        notifyClients(client -> client.onProxyStateUpdated(proxyState.toBundle()));

        // Also update the service notification
        updateServiceNotification();
    }

    public void updateProxyActivityStats() {
        notifyClients(client -> client.onProxyActivityStatsUpdated(proxyActivityStats.toBundle()));

        // Also update the service notification
        updateServiceNotification();
    }

    private void updateServiceNotification() {
        Notification notification = notificationForProxyState(proxyState, proxyActivityStats);
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(R.id.notification_id_proxy_state, notification);
        }
    }

    // Functional interface to represent a client notification action
    @FunctionalInterface
    private interface ClientNotifier {
        void notify(IConduitClientCallback client) throws RemoteException;
    }
}
