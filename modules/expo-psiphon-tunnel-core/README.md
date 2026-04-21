# expo-psiphon-tunnel-core

Expo module that hosts the Conduit Android station-mode runtime and exposes a small cross-platform JS API. Android is fully implemented here; iOS currently ships a compatible stub so the app can load the module on both platforms.

## Current scope

### Android

- Runs station mode in a special-use foreground service.
- Exposes start/update/stop controls for station mode.
- Emits live station-state, pending-error, and activity-stats events to JS.
- Exposes the exported `ConduitStateService` IPC surface used by trusted companion apps.
- Buffers IPC events natively until JS starts observing them.
- Schedules feedback uploads with `WorkManager` when asked to send diagnostics.
- Restarts the foreground service after app package replacement when the persisted running flag is set.

### iOS

- `toggleInProxy`, `paramsChanged`, `stopInProxy`, and `sendFeedback` reject with `ERR_UNIMPLEMENTED`.
- `logInfo`, `logWarn`, and `logError` are implemented as simple `NSLog` calls.
- Observing `inproxyEvent` emits a synthetic `proxyError` with `action: "unimplemented"` so the app can preserve its existing control flow.
- `ipcEvent` observation is a no-op.

## JS API

- `toggleInProxy(params)`
- `paramsChanged(params)`
- `stopInProxy()`
- `emitCurrentInproxyState()`
- `addInproxyEventListener(listener)`
- `addIpcEventListener(listener)`
- `sendFeedback(inproxyId)`
- `logInfo(tag, message)`
- `logWarn(tag, message)`
- `logError(tag, message)`

### `InproxyParameters`

```ts
type InproxyParameters = {
    privateKey: string;
    maxClients: number;
    limitUpstreamBytesPerSecond: number;
    limitDownstreamBytesPerSecond: number;
    reducedStartTime?: string;
    reducedEndTime?: string;
    reducedMaxClients?: number;
    reducedLimitUpstreamBytesPerSecond?: number;
    reducedLimitDownstreamBytesPerSecond?: number;
};
```

## Event contracts

### In-proxy events

`addInproxyEventListener` listens to `inproxyEvent` and immediately calls `emitCurrentInproxyState()` from the JS wrapper so newly attached listeners get the latest known state.

Event shapes:

- `{ type: "proxyState", data: { status, networkState } }`
- `{ type: "proxyError", data: { action, message? } }`
- `{ type: "inProxyActivityStats", data: { ...stats } }`

`proxyState.data.status`:

- `RUNNING`
- `STOPPED`
- `UNKNOWN`

`proxyState.data.networkState`:

- `HAS_INTERNET`
- `NO_INTERNET`
- `null`

`proxyError.data.action` can be:

- `inProxyStartFailed`
- `inProxyRestartFailed`
- `inProxyMustUpgrade`
- `unimplemented` (iOS stub only)

`inProxyActivityStats` includes:

- current aggregate counters
- short-window bucketed series under `dataByPeriod["1000ms"]`
- segmented personal/common/total stats
- personal/common regional activity
- 48h / 7d / 30d regional breakdowns

### IPC events

`addIpcEventListener` emits queued Android IPC events from `ConduitStateService`:

- `{ type: "bind", data: { status, timestampMs?, caller?, message? } }`
- `{ type: "registerClient", data: { status, timestampMs?, caller?, activeClientCount?, message? } }`
- `{ type: "unregisterClient", data: { status, timestampMs?, caller?, activeClientCount?, message? } }`
- `{ type: "fetchConduitPrivateKey", data: { status, timestampMs?, caller?, message? } }`
- `{ type: "stateClient", data: { status: "disconnected", timestampMs?, activeClientCount?, message? } }`

IPC events are buffered natively until JS starts observing, so early bind/register/fetch activity is not lost while the app is starting.

## Android runtime behavior

- The module contributes its own Android manifest entries through manifest merge.
- It declares the foreground-service permissions needed by `InproxyForegroundService`.
- It declares the signature-level `SERVICE_STARTING_BROADCAST_PERMISSION` used by the companion-app IPC/startup flow.
- It exports `ConduitStateService` and registers `InproxyRestartReceiver` for `MY_PACKAGE_REPLACED` only.
- It does not restore station mode on device boot.

## Feedback behavior

- `sendFeedback(inproxyId)` enqueues a unique one-time `WorkManager` job on Android.
- The upload requires network connectivity.
- The JS promise resolves once the upload is scheduled, not when the upload finishes.
- iOS rejects with `ERR_UNIMPLEMENTED`.

## Configuration files

Replace placeholder configs before production builds:

- Android: `android/src/main/res/raw/android_psiphon_config`
- Android: `android/src/main/res/raw/android_embedded_server_entries`

The Android implementation will fail at runtime if these resources are missing from the merged app resources.

## Local development

For local Android development, you can add extra trusted signing certificates for the exported `ConduitStateService` IPC surface used by trusted companion apps. This keeps the real package/signature verification path active while allowing local dev builds of trusted clients to bind successfully.

- Gradle property: `-PpsiphonConduitDevTrustedSignaturesJson=...`
- Environment variable: `PSIPHON_CONDUIT_DEV_TRUSTED_SIGNATURES_JSON=...`

Expected JSON format:

```json
{
    "network.ryve.app": ["<SHA256_CERT_FINGERPRINT>"],
    "com.psiphon3": ["<SHA256_CERT_FINGERPRINT>"],
    "com.psiphon3.subscription": ["<SHA256_CERT_FINGERPRINT>"]
}
```

Examples:

- `cd android && ./gradlew assembleDebug -PpsiphonConduitDevTrustedSignaturesJson='{"network.ryve.app":["ABC..."],"com.psiphon3":["DEF..."],"com.psiphon3.subscription":["DEF..."]}'`
- `PSIPHON_CONDUIT_DEV_TRUSTED_SIGNATURES_JSON='{"network.ryve.app":["ABC..."],"com.psiphon3":["DEF..."],"com.psiphon3.subscription":["DEF..."]}' npx expo run:android`

These development signatures are additive; the built-in production signatures remain trusted. Do not ship local development fingerprints in production or distributable builds.
