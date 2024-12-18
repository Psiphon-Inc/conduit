package ca.psiphon.conduit.nativemodule;

import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Binder;
import android.os.DeadObjectException;
import android.os.IBinder;
import android.os.RemoteException;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import ca.psiphon.conduit.nativemodule.logging.MyLog;
import ca.psiphon.conduit.state.IConduitStateCallback;
import ca.psiphon.conduit.state.IConduitStateService;
import io.reactivex.Flowable;
import io.reactivex.disposables.CompositeDisposable;

public class ConduitStateService extends Service {

    private static final String TAG = ConduitStateService.class.getSimpleName();

    private record StateUpdate(int appVersion, ProxyState proxyState) {
        // Current schema version for the state update JSON structure
        private static final int CURRENT_SCHEMA = 0;

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
                MyLog.e(TAG, "Failed to create JSON object: " + e.getMessage());
            }
            return wrapper.toString();
        }
    }

    private final CompositeDisposable compositeDisposable = new CompositeDisposable();

    // Map to hold registered clients and their subscriptions
    private final Map<IBinder, IConduitStateCallback> clients = new ConcurrentHashMap<>();
    // Lock for clients map access
    private final Object clientsLock = new Object();

    // Interactor for getting state from the ConduitService
    private ConduitServiceInteractor conduitServiceInteractor;

    // Flowable for the running state of the service in JSON format
    // This Flowable is updated whenever the service state changes
    // and is used to update all registered clients
    private Flowable<String> runningState;

    // Holds current state update to send to newly registered clients
    private StateUpdate currentUpdate = null;

    // AIDL binder implementation
    private final IConduitStateService.Stub binder = new IConduitStateService.Stub() {
        @Override
        public void registerClient(IConduitStateCallback client) {
            if (client == null) {
                return;
            }

            // Check if the client is trusted (do this outside the lock since it doesn't need synchronization)
            int uid = Binder.getCallingUid();
            if (!isTrustedUid(uid)) {
                throw new SecurityException("Client is not authorized to register with this service.");
            }

            synchronized (clientsLock) {
                IBinder clientBinder = client.asBinder();
                if (!clients.containsKey(clientBinder)) {
                    clients.put(clientBinder, client);
                    if (currentUpdate != null) {
                        try {
                            client.onStateUpdate(currentUpdate.toJson());
                        } catch (RemoteException e) {
                            MyLog.e(TAG, "Failed to notify client: " + clientBinder + ", " + e.getMessage());
                        }
                    }
                    MyLog.i(TAG, "Client registered: " + clientBinder);
                }
            }
        }

        @Override
        public void unregisterClient(IConduitStateCallback client) {
            if (client == null) {
                return;
            }

            synchronized (clientsLock) {
                IBinder clientBinder = client.asBinder();
                clients.remove(clientBinder);
                MyLog.i(TAG, "Client unregistered: " + clientBinder);
            }
        }
    };

    @Override
    public void onCreate() {
        MyLog.init(getApplicationContext());

        // Load runtime trusted signatures configuration from file
        PackageHelper.configureRuntimeTrustedSignatures(PackageHelper.readTrustedSignaturesFromFile(getApplicationContext()));

        conduitServiceInteractor = new ConduitServiceInteractor(getApplicationContext());
        conduitServiceInteractor.onStart(getApplicationContext());

        initializeRunningState();
    }

    private void initializeRunningState() {
        runningState = Flowable.combineLatest(
                        Flowable.just(getAppVersionCode()),
                        conduitServiceInteractor.proxyStateFlowable().startWith(ProxyState.unknown()),
                        StateUpdate::new
                )
                .map(stateUpdate -> {
                    // Record the current state update to send to newly registered clients
                    currentUpdate = stateUpdate;
                    return stateUpdate.toJson();
                })
                .distinctUntilChanged();

        // Single subscription to the runningState Flowable to update all registered clients
        compositeDisposable.add(runningState.subscribe(
                state -> {
                    synchronized (clientsLock) {
                        for (Map.Entry<IBinder, IConduitStateCallback> entry : clients.entrySet()) {
                            IBinder clientBinder = entry.getKey();
                            IConduitStateCallback client = entry.getValue();
                            try {
                                client.onStateUpdate(state);
                            } catch (RemoteException e) {
                                // Remove the client if it is dead and do not log the exception as it is expected
                                // to happen when a client goes away without unregistering.
                                if (e instanceof DeadObjectException) {
                                    clients.remove(clientBinder);
                                } else {
                                    MyLog.e(TAG, "Failed to notify client: " + clientBinder + ", " + e.getMessage());
                                }
                            }
                        }
                    }
                },
                throwable -> MyLog.e(TAG, "Error in runningState flow: " + throwable.getMessage())
        ));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onDestroy() {
        compositeDisposable.dispose();
        synchronized (clientsLock) {
            clients.clear();
        }
        conduitServiceInteractor.onStop(getApplicationContext());
        conduitServiceInteractor.onDestroy(getApplicationContext());
    }

    private int getAppVersionCode() {
        try {
            return getPackageManager()
                    .getPackageInfo(getPackageName(), 0)
                    .versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            MyLog.e(TAG, "Failed to fetch app version code: " + e.getMessage());
            return -1;
        }
    }

    // Check if the calling UID is trusted
    private boolean isTrustedUid(int uid) {
        // Get the package names associated with the calling UID
        String[] packages = getPackageManager().getPackagesForUid(uid);

        if (packages == null || packages.length == 0) {
            MyLog.e(TAG, "Calling UID has no associated packages, rejecting.");
            return false;
        }

        // It is possible to have multiple packages associated with the same UID, iterate through all
        for (String packageName : packages) {
            if (PackageHelper.verifyTrustedPackage(getPackageManager(), packageName)) {
                return true;
            }
        }
        // Reject the UID if none of the packages are trusted
        MyLog.w(TAG, "None of the associated packages were trusted, rejecting UID.");
        return false;
    }
}
