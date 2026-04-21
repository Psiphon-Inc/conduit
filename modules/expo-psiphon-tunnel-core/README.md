# expo-psiphon-tunnel-core

Expo module providing Android in-proxy station mode controls and an iOS no-op stub.

## Current scope

- Android: in-proxy station foreground service controls and events are implemented.
- iOS: all station-mode APIs reject with `ERR_UNIMPLEMENTED`. The module loads successfully as a stub.

## API highlights

- `toggleInProxy(params)`
- `paramsChanged(params)`
- `stopInProxy()`
- `addInproxyEventListener(listener)`
- `addIpcEventListener(listener)`
- `sendFeedback(inproxyId)`
- `logInfo(tag, message)` / `logError(tag, message)` / `logWarn(tag, message)`

### In-proxy event payloads

`addInproxyEventListener` emits one of:

- `{ type: "proxyState", data: { status, networkState } }`
- `{ type: "proxyError", data: { action, message? } }`
- `{ type: "inProxyActivityStats", data: { ...stats } }`

`proxyError.action` can be:

- `inProxyStartFailed`
- `inProxyRestartFailed`
- `inProxyMustUpgrade`
- `unimplemented` (iOS station mode contract)

### IPC event payloads

`addIpcEventListener` emits queued Android IPC events from `ConduitStateService`:

- `{ type: "bind", data: { status, caller?, message? } }`
- `{ type: "registerClient", data: { status, caller?, activeClientCount?, message? } }`
- `{ type: "unregisterClient", data: { status, caller?, activeClientCount?, message? } }`
- `{ type: "fetchConduitPrivateKey", data: { status, caller?, message? } }`
- `{ type: "stateClient", data: { status: "disconnected", activeClientCount?, message? } }`

IPC events are buffered natively until JS starts observing, so early bind/register/fetch activity is not lost while the app is starting.

## Platform behavior contract

- Android: station mode is implemented.
- iOS: `toggleInProxy`, `paramsChanged`, and `stopInProxy` reject with `ERR_UNIMPLEMENTED`.

## Configuration files

Replace placeholder configs before production builds:

- Android: `android/src/main/res/raw/android_psiphon_config`
- Android: `android/src/main/res/raw/android_embedded_server_entries`

## Local Development

For local Android development, you can add extra trusted signing certificates for the
exported `ConduitStateService` IPC surface used by trusted companion apps. This keeps
the real package/signature verification path active while allowing local dev builds of
Ryve and Psiphon to bind successfully.

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

These development signatures are additive; the built-in production signatures remain
trusted. Do not ship local development fingerprints in production or distributable builds.
