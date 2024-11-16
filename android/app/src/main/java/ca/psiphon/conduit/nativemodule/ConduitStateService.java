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

    // Trusted packages and their signature hashes
    private static final class TrustedPackages {
        private static final Map<String, String> PACKAGES = Map.of(
                // Psiphon Pro
                "com.psiphon3.subscription",
                "76:DB:EF:15:F6:77:26:D4:51:A1:23:59:B8:57:9C:0D:7A:9F:63:5D:52:6A:A3:74:24:DF:13:16:32:F1:78:10"
                // Add more trusted packages as needed:
                // "com.another.package", "the:signature:hash:here",
                // "com.third.package", "another:signature:hash:here"
        );

        static boolean contains(String packageName) {
            return PACKAGES.containsKey(packageName);
        }

        static String getSignature(String packageName) {
            return PACKAGES.get(packageName);
        }
    }

    private record StateUpdate(int appVersion, ProxyState proxyState) {
        String toJson() {
            JSONObject json = new JSONObject();
            try {
                json.put("appVersion", appVersion);
                json.put("proxyState", proxyState.toJson());
            } catch (JSONException e) {
                Log.e(TAG, "Failed to create JSON object: " + e.getMessage());
            }
            return json.toString();
        }
    }

    private final CompositeDisposable compositeDisposable = new CompositeDisposable();

    // Map to hold registered clients and their subscriptions
    private final Map<IConduitStateCallback, Disposable> clientSubscriptions = new ConcurrentHashMap<>();

    private AppSignatureVerifier appSignatureVerifier;

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

        appSignatureVerifier = new AppSignatureVerifier(getApplicationContext());

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
            if (isTrustedPackage(packageName)) {
                return true;
            }
        }
        // Reject the UID if none of the packages are trusted
        Log.w(TAG, "None of the associated packages were trusted, rejecting UID.");
        return false;
    }

    // Check if the package is trusted
    private boolean isTrustedPackage(String packageName) {
        // Ensure the package is in the trusted list
        if (!TrustedPackages.contains(packageName)) {
            Log.e(TAG, "Package not found in the trusted list.");
            return false;
        }

        // Get the expected signature hash for the package
        String expectedSignature = TrustedPackages.getSignature(packageName);

        // Verify the signature of the package
        if (appSignatureVerifier.isSignatureValid(packageName, expectedSignature)) {
            Log.i(TAG, "Trusted package validated: " + packageName);
            return true;
        }
        Log.e(TAG, "Invalid signature for trusted package: " + packageName);
        return false;
    }
}
