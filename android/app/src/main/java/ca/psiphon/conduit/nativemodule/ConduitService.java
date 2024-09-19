package ca.psiphon.conduit.nativemodule;

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
    public static final String INTENT_ACTION_PARAMS_CHANGED = "ca.psiphon.conduit.nativemodule.ParamsChanged";
    public static final String INTENT_ACTION_PSIPHON_START_FAILED = "ca.psiphon.conduit.nativemodule.PsiphonStartFailed";
    public static final String INTENT_ACTION_PSIPHON_RESTART_FAILED = "ca.psiphon.conduit.nativemodule.PsiphonRestartFailed";
    public static final String INTENT_ACTION_INPROXY_MUST_UPGRADE = "ca.psiphon.conduit.nativemodule.InProxyMustUpgrade";

    private final String NOTIFICATION_CHANNEL_ID = "ConduitServiceChannel";

    // Enum to represent the state of the service
    private enum ServiceState {
        STOPPED,
        STARTING,
        RUNNING,
        STOPPING
    }

    // Variable to track the current state of the service
    private final AtomicReference<ServiceState> currentState = new AtomicReference<>(ServiceState.STOPPED);

    // List to hold the registered clients
    private final List<IConduitClientCallback> clients = new ArrayList<>();

    // PsiphonTunnel instance
    private final PsiphonTunnel psiphonTunnel = PsiphonTunnel.newPsiphonTunnel(this);

    // ExecutorService for running the Psiphon in-proxy task
    private final ExecutorService executorService = Executors.newSingleThreadExecutor();

    // Service parameters passed to the Psiphon tunnel via the config
    private ConduitServiceParameters conduitServiceParameters;

    private final Handler handler = new Handler(Looper.getMainLooper());

    // AIDL binder implementation
    private final IConduitService.Stub binder = new IConduitService.Stub() {
        @Override
        public void registerClient(IConduitClientCallback client) {
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

        @Override
        public void unregisterClient(IConduitClientCallback client) {
            if (client != null) {
                clients.remove(client);
            }
        }
    };
    // Proxy activity stats object
    private ProxyActivityStats proxyActivityStats = new ProxyActivityStats();

    // CountDownLatch to signal the in-proxy task to stop
    private CountDownLatch stopLatch;

    // Track current proxy state
    private ProxyState proxyState = ProxyState.serviceDefault();

    @Override
    public String getAppName() {
        return getString(R.string.app_name);
    }

    @Override
    public Context getContext() {
        return this;
    }

    @Override
    public String getPsiphonConfig() {
        // Validate passed Conduit parameters
        if (!conduitServiceParameters.validateParameters()) {
            throw new IllegalStateException("Service parameters are not initialized.");
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
            String storedProxyPrivateKey = conduitServiceParameters.getProxyPrivateKey();
            // Set only if not null, otherwise an ephemeral key will be generated internally
            if (storedProxyPrivateKey != null) {
                psiphonConfig.put("InproxyProxySessionPrivateKey", storedProxyPrivateKey);
            }

            int storedMaxClients = conduitServiceParameters.getMaxClients();
            psiphonConfig.put("InproxyMaxClients", storedMaxClients);

            int storedLimitUpstream = conduitServiceParameters.getLimitUpstreamBytes();
            psiphonConfig.put("InproxyLimitUpstreamBytesPerSecond", storedLimitUpstream);

            int storedLimitDownstream = conduitServiceParameters.getLimitDownstreamBytes();
            psiphonConfig.put("InproxyLimitDownstreamBytesPerSecond", storedLimitDownstream);

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
            updateProxyActivityStats(proxyActivityStats);
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
            updateProxyState(proxyState);
        });
    }

    @Override
    public void onStoppedWaitingForNetworkConnectivity() {
        MyLog.i(TAG, "Stopped waiting for network connectivity");
        handler.post(() -> {
            proxyState = proxyState.toBuilder()
                    .setNetworkState(ProxyState.NetworkState.HAS_INTERNET)
                    .build();
            updateProxyState(proxyState);
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
        conduitServiceParameters = new ConduitServiceParameters();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();

            // Handle the stop action
            if (INTENT_ACTION_STOP_SERVICE.equals(action)) {
                MyLog.i(TAG, "Received stop action from notification.");
                stopForegroundService();
                return START_NOT_STICKY;
            }

            // Handle different actions based on the current state
            synchronized (this) {
                ServiceState state = currentState.get();
                return switch (state) {
                    case STARTING, STOPPING -> {
                        MyLog.i(TAG, "Service is in an intermediate state (" + state + "); ignoring command: " + action);
                        yield START_NOT_STICKY;
                    }
                    case RUNNING -> {
                        if (INTENT_ACTION_TOGGLE_IN_PROXY.equals(action)) {
                            stopForegroundService();
                        } else if (INTENT_ACTION_PARAMS_CHANGED.equals(action)) {
                            handleParamsChanged(intent);
                        }
                        yield START_NOT_STICKY;
                    }
                    case STOPPED -> {
                        if (INTENT_ACTION_TOGGLE_IN_PROXY.equals(action)) {
                            // Update stored parameters before starting the service
                            updateParameters(intent);
                            startForegroundService();
                            yield START_REDELIVER_INTENT;
                        } else if (INTENT_ACTION_PARAMS_CHANGED.equals(action)) {
                            MyLog.i(TAG, "Service is not running; stopping the service and doing nothing.");
                            stopSelf();
                        }
                        yield START_NOT_STICKY;
                    }
                };
            }
        }

        // If the intent is null or the action is not recognized, stop the service
        stopSelf();
        return START_NOT_STICKY;
    }

    private void handleParamsChanged(Intent intent) {
        if (updateParameters(intent)) {
            // Restart the tunnel core
            MyLog.i(TAG, "Conduit parameters changed; restarting.");
            try {
                psiphonTunnel.restartPsiphon();
            } catch (PsiphonTunnel.Exception e) {
                MyLog.e(TAG, "Failed to restart psiphon: " + e);
                String errorMessage = e.getMessage();

                final Bundle extras = new Bundle();
                extras.putString("errorMessage", errorMessage);

                deliverIntent(getPendingIntent(getContext(), INTENT_ACTION_PSIPHON_RESTART_FAILED, extras),
                        R.string.notification_conduit_failed_to_restart_text,
                        R.id.notification_id_error_psiphon_restart_failed
                );
            }
        }
    }

    private boolean updateParameters(Intent intent) {
        int maxClients = intent.getIntExtra(ConduitServiceInteractor.MAX_CLIENTS, 0);
        int limitUpstreamBytesPerSecond = intent.getIntExtra(ConduitServiceInteractor.LIMIT_UPSTREAM_BYTES, 0);
        int limitDownstreamBytesPerSecond = intent.getIntExtra(ConduitServiceInteractor.LIMIT_DOWNSTREAM_BYTES, 0);
        String proxyPrivateKey = intent.getStringExtra(ConduitServiceInteractor.PROXY_PRIVATE_KEY);

        return conduitServiceParameters.updateParametersIfChanged(maxClients, limitUpstreamBytesPerSecond,
                limitDownstreamBytesPerSecond, proxyPrivateKey);
    }
    private synchronized void startForegroundService() {
        if (!currentState.compareAndSet(ServiceState.STOPPED, ServiceState.STARTING)) {
            MyLog.i(TAG, "Service is not stopped; cannot start.");
            return;
        }

        MyLog.i(TAG, "Starting in-proxy.");

        // Clear error notifications before starting the service
        cancelErrorNotifications();

        // Notify all ConduitServiceInteractor instances that the service is starting so they bind to exchange messages
        // with the service and receive tunnel state updates.
        Intent serviceStartingBroadcastIntent = new Intent(ConduitServiceInteractor.SERVICE_STARTING_BROADCAST_INTENT);
        // Only allow apps with the permission to receive the broadcast. The permission is defined in the manifest with
        // "signature" protection level as following:
        // <permission android:name="ca.psiphon.conduit.nativemodule.SERVICE_STARTING_BROADCAST_PERMISSION" android:protectionLevel="signature" />
        sendBroadcast(serviceStartingBroadcastIntent, ConduitServiceInteractor.SERVICE_STARTING_BROADCAST_PERMISSION);


        // Start the service in the foreground with a notification
        startForegroundServiceWithNotification();

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
                updateProxyState(proxyState);

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

                // Set the state to STOPPED, this is not strictly necessary because the service is stopping, but it is
                // good practice
                currentState.set(ServiceState.STOPPED);
            }
        });

        // Update the state to RUNNING after starting the task
        currentState.set(ServiceState.RUNNING);
    }

    private synchronized void stopForegroundService() {
        if (!currentState.compareAndSet(ServiceState.RUNNING, ServiceState.STOPPING)) {
            MyLog.i(TAG, "Service is not running; cannot stop.");
            return;
        }

        MyLog.i(TAG, "Stopping the foreground service.");

        // Signal the task to stop
        if (stopLatch != null) {
            stopLatch.countDown();
        }
    }

    private void startForegroundServiceWithNotification() {
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

        // Start the service in the foreground
        startForeground(R.id.notification_id_proxy_state, notificationForState(proxyState));
    }

    private Notification notificationForState(ProxyState proxyState) {
        int notificationIconId;
        CharSequence notificationText;

        // Handle the no internet state first
        ProxyState.NetworkState networkState = proxyState.networkState();
        if (networkState == ProxyState.NetworkState.NO_INTERNET) {
            notificationIconId = R.drawable.ic_conduit_no_internet;
            notificationText = getString(R.string.conduit_service_no_internet_notification_text);
        } else {
            notificationIconId = R.drawable.ic_conduit_active;
            notificationText = getString(R.string.conduit_service_running_notification_text);
        }
        return buildNotification(notificationIconId, notificationText);
    }

    private Notification buildNotification(int notificationIconId, CharSequence notificationText) {
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
                .setContentText(notificationText)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(notificationText))
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
        if (Build.VERSION.SDK_INT < 29 || pingClients()) {
            try {
                pendingIntent.send(getContext(), 0, null);
            } catch (PendingIntent.CanceledException e) {
                showErrorNotification(pendingIntent, messageId, notificationId);
            }
        } else {
            showErrorNotification(pendingIntent, messageId, notificationId);
        }
    }

    private boolean pingClients() {
        for (IConduitClientCallback client : clients) {
            try {
                client.ping();
                return true; // Successfully pinged a client
            } catch (RemoteException e) {
                MyLog.e(TAG, "Failed to ping client: " + e);
            }
        }
        return false; // No clients successfully pinged
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
    private void notifyClients(ClientNotifier notifier) {
        for (Iterator<IConduitClientCallback> iterator = clients.iterator(); iterator.hasNext(); ) {
            IConduitClientCallback client = iterator.next();
            try {
                notifier.notify(client);
            } catch (RemoteException e) {
                MyLog.e(TAG, "Failed to send update to client: " + e);
                if (e instanceof DeadObjectException) {
                    iterator.remove();
                }
            }
        }
    }

    public void updateProxyState(ProxyState state) {
        notifyClients(client -> client.onProxyStateUpdated(state.toBundle()));

        // Also update the service notification
        Notification notification = notificationForState(state);
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.notify(R.id.notification_id_proxy_state, notification);
        }
    }

    public void updateProxyActivityStats(ProxyActivityStats stats) {
        notifyClients(client -> client.onProxyActivityStatsUpdated(stats.toBundle()));
    }

    // Functional interface to represent a client notification action
    @FunctionalInterface
    private interface ClientNotifier {
        void notify(IConduitClientCallback client) throws RemoteException;
    }
}
