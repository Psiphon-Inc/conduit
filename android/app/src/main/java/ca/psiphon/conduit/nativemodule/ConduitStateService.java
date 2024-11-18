package ca.psiphon.conduit.nativemodule;

import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.DeadObjectException;
import android.os.IBinder;
import android.os.RemoteException;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import ca.psiphon.conduit.nativemodule.logging.MyLog;
import ca.psiphon.conduit.state.IConduitStateCallback;
import ca.psiphon.conduit.state.IConduitStateService;
import io.reactivex.Flowable;
import io.reactivex.disposables.CompositeDisposable;
import io.reactivex.disposables.Disposable;

public class ConduitStateService extends Service {

    private static final String TAG = ConduitStateService.class.getSimpleName();

    private record StateUpdate(int appVersion, ProxyState proxyState) {
        // Current schema version for the state update JSON structure
        private static final int CURRENT_SCHEMA = 1;

        String toJson() {
            // Wraps state data with schema version to support future changes
            // to the JSON structure without breaking clients.
            // JSON structure:
            // {
            //  "schema": 1, // Current schema version
            //  "data": {
            //    "appVersion": 123, // App version code
            //    "running": true/false, // Proxy running status, omitted for UNKNOWN state
            //  }
            JSONObject data = new JSONObject();
            JSONObject wrapper = new JSONObject();
            try {
                data.put("appVersion", appVersion);
                // For UNKNOWN proxy state, omit running status since it represents an uninitialized state
                if (!proxyState.isUnknown()) {
                    data.put("running", proxyState.isRunning());
                }
                // Only schema version at top level,
                wrapper.put("schema", CURRENT_SCHEMA);
                wrapper.put("data", data);
            } catch (JSONException e) {
                Log.e(TAG, "Failed to create JSON object: " + e.getMessage());
            }
            return wrapper.toString();
        }
    }

    private final CompositeDisposable compositeDisposable = new CompositeDisposable();

    // Map to hold registered clients and their subscriptions
    private final Map<IConduitStateCallback, Disposable> clientSubscriptions = new ConcurrentHashMap<>();

    // Interactor for getting state from the ConduitService
    private ConduitServiceInteractor conduitServiceInteractor;

    private Flowable<String> runningState;

    // AIDL binder implementation
    private final IConduitStateService.Stub binder = new IConduitStateService.Stub() {
        @Override
        public void registerClient(IConduitStateCallback client) {
            // Ignore null clients or already registered clients
            if (client == null || clientSubscriptions.containsKey(client)) {
                return;
            }

            // Check if the client is trusted
            int uid = Binder.getCallingUid();
            if (!isTrustedUid(uid)) {
                return;
            }

            // Subscribe the client to runningState
            Disposable subscription = runningState.subscribe(
                    state -> {
                        try {
                            client.onStateUpdate(state);
                        } catch (RemoteException e) {
                            // Unregister on error
                            unregisterClient(client);
                            if (!(e instanceof DeadObjectException)) {
                                // Log error if it's not a DeadObjectException
                                Log.e(TAG, "Failed to send state update to client: " + e.getMessage());
                            }
                        }
                    },
                    throwable -> Log.e(TAG, "Error in runningState flow for client: " + throwable.getMessage())
            );

            clientSubscriptions.put(client, subscription);
            compositeDisposable.add(subscription);

            Log.i(TAG, "Client registered.");
        }

        @Override
        public void unregisterClient(IConduitStateCallback client) {
            if (client == null) {
                return;
            }

            // Dispose of the client's subscription
            Disposable subscription = clientSubscriptions.remove(client);
            if (subscription != null && !subscription.isDisposed()) {
                subscription.dispose();
                Log.i(TAG, "Client unregistered.");
            }
        }
    };

    @Override
    public void onCreate() {
        MyLog.init(getApplicationContext());

        conduitServiceInteractor = new ConduitServiceInteractor(getApplicationContext());
        conduitServiceInteractor.onStart(getApplicationContext());

        initializeRunningState();

        Log.i(TAG, "ConduitStateService created and runningState initialized.");
    }

    private void initializeRunningState() {
        runningState = Flowable.combineLatest(
                        Flowable.just(getAppVersionCode()),
                        conduitServiceInteractor.proxyStateFlowable().startWith(ProxyState.unknown()),
                        StateUpdate::new
                )
                .map(StateUpdate::toJson)
                .distinctUntilChanged()
                .replay(1)
                .refCount();

        // Keep one subscription always active
        compositeDisposable.add(runningState.subscribe(
                state -> {
                }, // No-op for state updates
                throwable -> Log.e(TAG, "Error in persistent runningState subscription: " + throwable.getMessage())
        ));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onDestroy() {
        compositeDisposable.dispose();
        conduitServiceInteractor.onStop(getApplicationContext());
        conduitServiceInteractor.onDestroy(getApplicationContext());
    }

    private int getAppVersionCode() {
        try {
            return getPackageManager()
                    .getPackageInfo(getPackageName(), 0)
                    .versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            Log.e(TAG, "Failed to fetch app version code: " + e.getMessage());
            return -1;
        }
    }

    // Check if the calling UID is trusted
    private boolean isTrustedUid(int uid) {
        // Get the package names associated with the calling UID
        String[] packages = getPackageManager().getPackagesForUid(uid);

        if (packages == null || packages.length == 0) {
            Log.e(TAG, "Calling UID has no associated packages, rejecting.");
            return false;
        }

        // It is possible to have multiple packages associated with the same UID, iterate through all
        for (String packageName : packages) {
            if (PackageHelper.verifyTrustedPackage(getPackageManager(), packageName)) {
                return true;
            }
        }
        // Reject the UID if none of the packages are trusted
        Log.w(TAG, "None of the associated packages were trusted, rejecting UID.");
        return false;
    }
}
