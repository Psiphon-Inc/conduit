# Personal pairing configuration contract

- Android SecureStore/query identity is **desired** configuration. Hosted login
  reconciles it (including conflicts); sync failure retains it. Hosted snapshots
  never independently select Android sharing identity. iOS/web keep hosted selection.
  A fallback identity is generated only after SecureStore confirms absence, never
  while its read is pending. Login cancels older identity queries before caching
  the reconciled desired identity.
- Android `proxyState.data.pairingConfiguration` is native readback:
  `{ revision, status: "persisted" | "applying" | "applied", personalCompartmentId }`.
  Revisions increase across service instances within a device boot. Older revisions
  are ignored; repeated current readback can refill a cleared cache. Missing readback
  or `applying` means no shareable identity.
- `applied` means the configuration passed to the core was accepted by a successful
  `startTunneling`/`restartPsiphon` return, **not** broker announcement or health.
  `persisted` means the core is stopped and the identity is read from native settings
  for next start. Failed restart remains unshareable until actual stop completes.
  Unchanged parameters still publish readback; listener registration and foreground
  refresh return the current readback, including restored native settings.
  Observation teardown/foreground refresh clears the share cache pending readback;
  service disconnection emits unavailable state. Native identity is never persisted
  in the React Query cache across app launches.
- `paramsChanged` keeps its existing dispatch-only promise. Desired React state and
  that promise are never application acknowledgements. Async parameter loads/selections
  discard superseded work before native dispatch.
- `InproxyProvider` accepts an optional `ConduitModuleAPI` adapter; by default it
  uses `getConduitModule()` to resolve native/simulator code at mount time. The
  existing `ConduitModule` facade and Expo bridge method signatures remain available.
- The share modal subscribes to current platform identity and wrapper URL while open.
  Pairing IDs are private; neither the ID nor previews belong in diagnostics.

Dependencies: `src/hosted/contracts.ts`, `src/inproxy/types.ts`,
`modules/expo-psiphon-tunnel-core/index.ts`, existing proxy-state AIDL callbacks.
