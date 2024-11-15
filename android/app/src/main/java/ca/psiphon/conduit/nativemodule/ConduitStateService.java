package ca.psiphon.conduit.nativemodule;

import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.DeadObjectException;
import android.os.IBinder;
import android.os.RemoteException;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import ca.psiphon.conduit.state.IConduitStateCallback;
import ca.psiphon.conduit.state.IConduitStateService;
import io.reactivex.Flowable;
import io.reactivex.disposables.Disposable;

public class ConduitStateService extends Service {

    private static final String TAG = ConduitStateService.class.getSimpleName();

    // Map to hold registered clients and their subscriptions
    private final Map<IConduitStateCallback, Disposable> clientSubscriptions = new ConcurrentHashMap<>();

    // Interactor for getting state from the ConduitService
    private ConduitServiceInteractor conduitServiceInteractor;

    private Flowable<String> runningState;

    // State updates subscription disposable
    private Disposable persistentRunningStateSubscription;

    // Unified method to send updates to all registered clients
    private synchronized void notifyClients(ClientNotifier notifier) {
        Iterator<Map.Entry<IConduitStateCallback, Disposable>> iterator = clientSubscriptions.entrySet().iterator();

        while (iterator.hasNext()) {
            Map.Entry<IConduitStateCallback, Disposable> entry = iterator.next();
            IConduitStateCallback client = entry.getKey();

            try {
                notifier.notify(client);
            } catch (RemoteException e) {
                // Always remove the client on any RemoteException
                iterator.remove();
                Disposable subscription = entry.getValue();
                if (subscription != null && !subscription.isDisposed()) {
                    subscription.dispose();
                }

                // Log only if the exception is not DeadObjectException
                if (!(e instanceof DeadObjectException)) {
                    Log.e(TAG, "Failed to notify client: " + e.getMessage());
                }
            }
        }
    }

    // AIDL binder implementation
    private final IConduitStateService.Stub binder = new IConduitStateService.Stub() {
        @Override
        public void registerClient(IConduitStateCallback client) {
            if (client == null || clientSubscriptions.containsKey(client)) {
                return; // Ignore null clients or already registered clients
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

            // Add the client and their subscription to the map
            clientSubscriptions.put(client, subscription);

            Log.i(TAG, "Client registered.");
        }

        @Override
        public void unregisterClient(IConduitStateCallback client) {
            if (client == null || !clientSubscriptions.containsKey(client)) {
                return;
            }

            // Dispose of the client's subscription
            Disposable subscription = clientSubscriptions.remove(client);
            if (subscription != null && !subscription.isDisposed()) {
                subscription.dispose();
            }

            Log.i(TAG, "Client unregistered.");
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        conduitServiceInteractor = new ConduitServiceInteractor(getApplicationContext());
        conduitServiceInteractor.onStart(getApplicationContext());

        runningState = Flowable.combineLatest(
                        Flowable.just(getAppVersionCode()), // App version
                        conduitServiceInteractor.proxyStateFlowable().startWith(ProxyState.unknown()), // Proxy state
                        (version, state) -> {
                            JSONObject json = new JSONObject();
                            try {
                                json.put("appVersion", version); // versionCode as an int
                                json.put("proxyState", state.toJson()); // ProxyState as a JSON object
                            } catch (JSONException e) {
                                Log.e(TAG, "Failed to create JSON object: " + e.getMessage());
                            }
                            return json.toString();
                        }
                )
                .distinctUntilChanged() // Only emit if the state has changed
                .replay(1) // Cache the last emitted item
                .refCount(); // Stop emitting items when all subscribers have unsubscribed

        // Start a persistent subscription to get latest running state as soon as possible
        startPersistentRunningStateSubscription();

        Log.i(TAG, "ConduitStateService created and runningState initialized.");
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopPersistentRunningStateSubscription();
        unsubscribeAllClients();
        conduitServiceInteractor.onStop(getApplicationContext());
        conduitServiceInteractor.onDestroy(getApplicationContext());
    }

    private void startPersistentRunningStateSubscription() {
        if (persistentRunningStateSubscription == null || persistentRunningStateSubscription.isDisposed()) {
            persistentRunningStateSubscription = runningState
                    .subscribe(
                            update -> Log.d(TAG, "Persistent subscription received update: " + update),
                            throwable -> Log.e(TAG, "Error in persistent subscription: " + throwable.getMessage())
                    );
            Log.i(TAG, "Persistent runningState subscription started.");
        }
    }

    private void stopPersistentRunningStateSubscription() {
        if (persistentRunningStateSubscription != null && !persistentRunningStateSubscription.isDisposed()) {
            persistentRunningStateSubscription.dispose();
            persistentRunningStateSubscription = null;
            Log.i(TAG, "Persistent runningState subscription stopped.");
        }
    }

    private void unsubscribeAllClients() {
        for (Map.Entry<IConduitStateCallback, Disposable> entry : clientSubscriptions.entrySet()) {
            Disposable subscription = entry.getValue();
            if (subscription != null && !subscription.isDisposed()) {
                subscription.dispose();
            }
        }
        clientSubscriptions.clear();
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

    // Functional interface for client notifications
    @FunctionalInterface
    private interface ClientNotifier {
        void notify(IConduitStateCallback client) throws RemoteException;
    }
}
