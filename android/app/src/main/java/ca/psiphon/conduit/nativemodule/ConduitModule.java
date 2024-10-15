package ca.psiphon.conduit.nativemodule;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import ca.psiphon.conduit.nativemodule.logging.FeedbackWorker;
import ca.psiphon.conduit.nativemodule.logging.LogFileUtils;
import ca.psiphon.conduit.nativemodule.logging.LogUtils;
import ca.psiphon.conduit.nativemodule.logging.LogsMaintenanceWorker;
import ca.psiphon.conduit.nativemodule.logging.MyLog;
import ca.psiphon.conduit.nativemodule.stats.ProxyActivityStats;
import io.reactivex.Flowable;
import io.reactivex.android.schedulers.AndroidSchedulers;
import io.reactivex.disposables.CompositeDisposable;
import io.reactivex.disposables.Disposable;
import io.reactivex.exceptions.OnErrorNotImplementedException;
import io.reactivex.exceptions.UndeliverableException;
import io.reactivex.plugins.RxJavaPlugins;

public class ConduitModule extends ReactContextBaseJavaModule implements LifecycleEventListener, ActivityEventListener {
    // Module name
    public static final String NAME = "ConduitModule";
    public static final String TAG = ConduitModule.class.getSimpleName();

    private final ConduitServiceInteractor conduitServiceInteractor;
    private boolean hasHandledIntent = false;
    private int listenerCount = 0;
    private final CompositeDisposable compositeDisposable = new CompositeDisposable();
    private Disposable emitConduitStateDisposable;
    private Disposable emitProxyActivityStatsDisposable;

    // Constructor
    public ConduitModule(ReactApplicationContext context) {
        super(context);
        if (context == null) {
            throw new IllegalStateException("Context cannot be null");
        }

        conduitServiceInteractor = new ConduitServiceInteractor(context);

        // Initialize context dependent components in the constructor to avoid method order issues. For example,
        // onHostResume() may be called before initialize() but we want the logging system to be ready as soon as possible.

        // Initialize the logging system
        MyLog.init(context.getApplicationContext());

        // Setup the RxJava error handler
        setupRxJavaErrorHandler();

        // Schedule the logs maintenance worker
        // The worker will run immediately when enqueued and then repeat every
        // LogsMaintenanceWorker.REPEAT_INTERVAL_HOURS hours replacing any
        // existing scheduled maintenance request
        LogsMaintenanceWorker.schedule(context);

        // Register lifecycle and activity event listeners
        context.addLifecycleEventListener(this);
        context.addActivityEventListener(this);
    }

    public static File dataRootDirectory(Context context) {
        File rootDirectory = context.getApplicationContext().getFilesDir();
        File dataRootDirectory = new File(rootDirectory, Constants.DATA_ROOT_DIRECTORY_NAME);
        if (!dataRootDirectory.exists() && !dataRootDirectory.mkdirs()) {
            throw new IllegalStateException("Failed to create data root directory");
        }
        return dataRootDirectory;
    }

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void toggleInProxy(int maxClients, int limitUpstreamBytesPerSecond, int limitDownstreamBytesPerSecond,
            String privateKey, Promise promise) {
        try {
            conduitServiceInteractor.toggleInProxy(getReactApplicationContext(), maxClients,
                    limitUpstreamBytesPerSecond, limitDownstreamBytesPerSecond, privateKey);
            promise.resolve(null);

        } catch (Exception e) {
            MyLog.e(TAG, "Failed to toggle conduit service: " + e);
            promise.reject("TOGGLE_SERVICE_ERROR", "Failed to toggle conduit service", e);
        }
    }

    @ReactMethod
    public void paramsChanged(int maxClients, int limitUpstreamBytesPerSecond, int limitDownstreamBytesPerSecond,
            String privateKey, Promise promise) {
        try {
            conduitServiceInteractor.paramsChanged(getReactApplicationContext(), maxClients,
                    limitUpstreamBytesPerSecond, limitDownstreamBytesPerSecond, privateKey);
            promise.resolve(null);

        } catch (Exception e) {
            MyLog.e(TAG, "Failed to toggle conduit service: " + e);
            promise.reject("TOGGLE_SERVICE_ERROR", "Failed to toggle conduit service", e);
        }
    }

    @ReactMethod
    public void sendFeedback(Promise promise) {
        final String FEEDBACK_UPLOAD_WORK_NAME = "FeedbackUploadWork";
        final String TAG = "FeedbackUpload"; // Add TAG constant

        try {
            // Check the current state of the unique work named FEEDBACK_UPLOAD_WORK_NAME
            ListenableFuture<List<WorkInfo>> future = WorkManager.getInstance(getReactApplicationContext())
                    .getWorkInfosForUniqueWork(FEEDBACK_UPLOAD_WORK_NAME);

            future.addListener(() -> {
                try {
                    // Get the list of work infos for FEEDBACK_UPLOAD_WORK_NAME work
                    List<WorkInfo> workInfos = future.get();
                    boolean hasPendingWork = false;

                    for (WorkInfo workInfo : workInfos) {
                        // Log complete state of the work info
                        MyLog.i(TAG, "WorkInfo: " + workInfo);
                        if (workInfo.getState() == WorkInfo.State.ENQUEUED || workInfo.getState() == WorkInfo.State.RUNNING) {
                            hasPendingWork = true;
                        }
                    }

                    // If there is no pending work, proceed with generating feedback ID, creating feedback logs and
                    // scheduling the worker, otherwise do nothing
                    if (!hasPendingWork) {
                        String feedbackId = LogUtils.generateFeedbackId();
                        LogFileUtils.createFeedbackLogs(getReactApplicationContext(), feedbackId);

                        // Prepare input data for the worker
                        Data inputData = new Data.Builder()
                                .putString("feedbackId", feedbackId)
                                .putLong("feedbackTimestamp", System.currentTimeMillis())
                                .build();

                        // Define constraints to ensure the work only runs when connected to the internet
                        Constraints uploadConstraints = new Constraints.Builder()
                                .setRequiredNetworkType(NetworkType.CONNECTED)
                                .build();

                        // Create the work request for uploading feedback
                        OneTimeWorkRequest uploadWorkRequest = new OneTimeWorkRequest.Builder(FeedbackWorker.class)
                                .setInputData(inputData)
                                .setConstraints(uploadConstraints)
                                .addTag("feedbackId: " + feedbackId)
                                .build();

                        // Enqueue the unique work request
                        WorkManager.getInstance(getReactApplicationContext())
                                .enqueueUniqueWork(FEEDBACK_UPLOAD_WORK_NAME, ExistingWorkPolicy.REPLACE,
                                        uploadWorkRequest);
                    }

                    // Resolve the promise if the operation is successful
                    promise.resolve(null);

                } catch (ExecutionException | InterruptedException e) {
                    MyLog.e(TAG, "Failed to check existing work: " + e);
                    promise.reject("CHECK_WORK_ERROR", "Failed to check existing work", e);
                } catch (Exception e) {
                    MyLog.e(TAG, "Failed to schedule feedback upload: " + e);
                    promise.reject("SCHEDULE_WORK_ERROR", "Failed to schedule feedback upload", e);
                }
            }, Executors.newSingleThreadExecutor());

        } catch (Exception e) {
            MyLog.e(TAG, "Unexpected error: " + e);
            promise.reject("UNEXPECTED_ERROR", "Unexpected error", e);
        }
    }

    // Expose MyLog methods except for verbose and debug logging
    // since verbose and debug logs are not persisted.
    @ReactMethod
    public void logInfo(String tag, String msg) {
        MyLog.i(tag, msg);
    }

    @ReactMethod
    public void logError(String tag, String msg) {
        MyLog.e(tag, msg);
    }

    @ReactMethod
    public void logWarn(String tag, String msg) {
        MyLog.w(tag, msg);
    }

    @ReactMethod
    public void addListener(String eventName) {
        if (!"ConduitEvent".equals(eventName)) {
            return;
        }
        listenerCount += 1;

        // Emit Psiphon connection state
        if (emitConduitStateDisposable == null || emitConduitStateDisposable.isDisposed()) {
            emitConduitStateDisposable = conduitServiceInteractor.proxyStateFlowable()
                    .doOnNext(this::emitProxyState)
                    .observeOn(AndroidSchedulers.mainThread())
                    .subscribe();
            compositeDisposable.add(emitConduitStateDisposable);
        }

        // Emit proxy activity stats
        if (emitProxyActivityStatsDisposable == null || emitProxyActivityStatsDisposable.isDisposed()) {
            // Create a helper observable that emits a proxy activity stats value every
            // ProxyActivityStats.BUCKET_PERIOD_MILLISECONDS milliseconds if proxy activity stats are available
            Flowable<ProxyActivityStats> intervalProxyActivityFlowable =
                    Flowable.interval(ProxyActivityStats.BUCKET_PERIOD_MILLISECONDS, TimeUnit.MILLISECONDS)
                            // Emit the initial value of 0L before the interval starts emitting to ensure that the first
                            // proxy activity series is emitted immediately instead of waiting for the first interval
                            .startWith(0L)
                            // Drop emissions if the downstream can't keep up
                            .onBackpressureDrop()
                            .switchMap(ignored -> conduitServiceInteractor.proxyActivityStatsFlowable());


            // Start observing the proxy state
            emitProxyActivityStatsDisposable = conduitServiceInteractor.proxyStateFlowable()
                    // Map the tunnel state to a boolean indicating if the proxy is running
                    .map(ProxyState::isRunning)
                    // Emit only when the proxy running state changes
                    .distinctUntilChanged()
                    // Switch to the intervalProxyActivityFlowable if the proxy is running and stop downstream emissions
                    // if the proxy is stopped or the proxy state is unknown
                    .switchMap(isRunning -> isRunning ? intervalProxyActivityFlowable : Flowable.empty())
                    .doOnNext(this::emitProxyActivityStats)
                    .observeOn(AndroidSchedulers.mainThread())
                    .subscribe();

            compositeDisposable.add(emitProxyActivityStatsDisposable);
        }
    }

    @ReactMethod
    public void removeListeners(Integer count) {
        listenerCount -= count;
        // Stop emitting Psiphon connection state events and data transfer stats if there are no listeners
        if (listenerCount <= 0) {
            if (emitConduitStateDisposable != null) {
                emitConduitStateDisposable.dispose();
            }
            if (emitProxyActivityStatsDisposable != null) {
                emitProxyActivityStatsDisposable.dispose();
            }
        }
    }

    private void setupRxJavaErrorHandler() {
        RxJavaPlugins.setErrorHandler(e -> {
            if (e instanceof UndeliverableException) {
                e = e.getCause();
            }
            if ((e instanceof IOException)) {
                // fine, irrelevant network problem or API that throws on cancellation
                return;
            }
            if (e instanceof InterruptedException) {
                // fine, some blocking code was interrupted by a dispose call
                return;
            }
            if (e instanceof OnErrorNotImplementedException) {
                Thread.currentThread().getUncaughtExceptionHandler().uncaughtException(Thread.currentThread(), e);
                return;
            }
            if (e instanceof RuntimeException) {
                Thread.currentThread().getUncaughtExceptionHandler().uncaughtException(Thread.currentThread(), e);
                return;
            }
            if (e instanceof Error) {
                Thread.currentThread().getUncaughtExceptionHandler().uncaughtException(Thread.currentThread(), e);
            }
        });
    }

    @Override
    public void onHostResume() {
        // There is not callback for when the host is created, so we use onHostResume to handle the intent
        // if it is being called for the first time.
        if (!hasHandledIntent) {
            hasHandledIntent = true;
            handleIntent(getCurrentActivity().getIntent());
        }
        conduitServiceInteractor.onStart(getReactApplicationContext());
    }

    @Override
    public void onHostPause() {
        conduitServiceInteractor.onStop(getReactApplicationContext());
    }

    @Override
    public void onHostDestroy() {
        // Do nothing
    }

    @Override
    public void onActivityResult(Activity activity, int i, int i1, @Nullable Intent intent) {
        // Do nothing
    }

    @Override
    public void onNewIntent(Intent intent) {
        handleIntent(intent);
    }

    @Override
    public void invalidate() {
        super.invalidate();
        conduitServiceInteractor.onDestroy(getReactApplicationContext());
    }

    private void handleIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) {
            return;
        }

        try {
            PackageManager pm = getReactApplicationContext().getPackageManager();
            PackageInfo packageInfo = pm.getPackageInfo(getReactApplicationContext().getPackageName(), 0);
            ComponentName componentName = new ComponentName(packageInfo.packageName,
                    packageInfo.packageName + ".TunnelIntentsProxy");

            //  Ignore the intent if it is not from the TunnelIntentsProxy component
            if (!componentName.equals(intent.getComponent())) {
                return;
            }

        } catch (PackageManager.NameNotFoundException ignored) {
        }

        String action = intent.getAction();
        Bundle extras = intent.getExtras();
        if (ConduitService.INTENT_ACTION_PSIPHON_START_FAILED.equals(action)) {
            // Error starting the tunnel
            emitProxyError("proxyStartFailed", extras);
        } else if (ConduitService.INTENT_ACTION_PSIPHON_RESTART_FAILED.equals(action)) {
            // Error restarting the tunnel
            emitProxyError("proxyRestartFailed", extras);
        } else if (ConduitService.INTENT_ACTION_INPROXY_MUST_UPGRADE.equals(action)) {
            // Error running in-proxy mode because the app must be upgraded
            emitProxyError("inProxyMustUpgrade", null);
        }
    }

    private void emitEvent(String eventType, WritableMap eventData) {
        WritableMap event = Arguments.createMap();
        event.putString("type", eventType);  // Add event type
        event.putMap("data", eventData);     // Add event data
        getReactApplicationContext()
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("ConduitEvent", event);
    }

    private void emitProxyState(ProxyState proxyState) {
        WritableMap proxyStateMap = Arguments.createMap();
        proxyStateMap.putString("status", proxyState.status().name());

        // If the tunnel state is not unknown or stopped, add the network state
        if (!proxyState.isUnknown() && !proxyState.isStopped()) {
            proxyStateMap.putString("networkState", proxyState.networkState().name());
        } else {
            proxyStateMap.putNull("networkState");
        }
        emitEvent("proxyState", proxyStateMap);
    }

    private void emitProxyActivityStats(ProxyActivityStats stats) {
        WritableMap proxyActivityStatsMap = Arguments.createMap();

        proxyActivityStatsMap.putInt("elapsedTime", (int) stats.getElapsedTime());
        proxyActivityStatsMap.putDouble("totalBytesUp", stats.getTotalBytesUp());
        proxyActivityStatsMap.putDouble("totalBytesDown", stats.getTotalBytesDown());
        proxyActivityStatsMap.putInt("currentConnectingClients", stats.getCurrentConnectingClients());
        proxyActivityStatsMap.putInt("currentConnectedClients", stats.getCurrentConnectedClients());

        WritableMap dataByPeriodMap = Arguments.createMap();

        for (int i = 0; i < stats.getBucketCollectionSize(); i++) {
            WritableMap bucketMap = Arguments.createMap();
            WritableArray bytesUp = Arguments.createArray();
            for (long value : stats.getBytesUpSeries(i)) {
                bytesUp.pushInt((int) value);
            }
            bucketMap.putArray("bytesUp", bytesUp);

            WritableArray bytesDown = Arguments.createArray();
            for (long value : stats.getBytesDownSeries(i)) {
                bytesDown.pushInt((int) value);
            }
            bucketMap.putArray("bytesDown", bytesDown);

            WritableArray connectingClients = Arguments.createArray();
            for (long value : stats.getConnectingClientsSeries(i)) {
                connectingClients.pushInt((int) value);
            }
            bucketMap.putArray("connectingClients", connectingClients);

            WritableArray connectedClients = Arguments.createArray();
            for (long value : stats.getConnectedClientsSeries(i)) {
                connectedClients.pushInt((int) value);
            }
            bucketMap.putArray("connectedClients", connectedClients);

            // Include the number of buckets (size)
            int numBuckets = stats.getNumBuckets(i);
            bucketMap.putInt("numBuckets", numBuckets);

            String key = stats.getBucketCollection(i).getDurationMillis() + "ms";
            dataByPeriodMap.putMap(key, bucketMap);
        }
        proxyActivityStatsMap.putMap("dataByPeriod", dataByPeriodMap);
        emitEvent("inProxyActivityStats", proxyActivityStatsMap);
    }

    private void emitProxyError(String action, Bundle bundle) {
        emitEvent("proxyError", getProxyEventMap(action, bundle));
    }

    private WritableMap getProxyEventMap(String action, Bundle bundle) {
        WritableMap eventData = Arguments.createMap();
        eventData.putString("action", action);
        WritableMap data = Arguments.createMap();

        // Add the bundle data to the data map of the event
        if (bundle != null) {
            for (String key : bundle.keySet()) {
                Object value = bundle.get(key);
                if (value instanceof String) {
                    data.putString(key, (String) value);
                } else if (value instanceof Integer) {
                    data.putInt(key, (Integer) value);
                } else if (value instanceof ArrayList<?> rawList) {
                    // Check if the ArrayList contains Strings before casting
                    boolean allStrings = true;
                    for (Object item : rawList) {
                        if (!(item instanceof String)) {
                            allStrings = false;
                            break;
                        }
                    }
                    if (allStrings) {
                        WritableArray array = Arguments.createArray();
                        for (Object item : rawList) {
                            array.pushString((String) item);
                        }
                        data.putArray(key, array);
                    }
                }
            }
            eventData.putMap("data", data);
        } else {
            eventData.putNull("data");
        }
        return eventData;
    }
}
