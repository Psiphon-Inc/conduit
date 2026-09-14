# Personal pairing configuration contract

- Android SecureStore/query identity is **desired** configuration. One session-scoped
  owner (`useHostedPersonalCompartmentSync`) reconciles it when an account session
  appears, including fresh login, auth-provider restore, and persisted-session
  bootstrap. Authentication and hosted snapshots do not wait for reconciliation.
  Only the account personal-compartment endpoint's validated 200 value or 409
  current value is authoritative for reconciliation; snapshots are never copied
  into local identity. iOS/web keep hosted selection and do not run this sync.
- A sync burst has at most three attempts: immediately, then after 1 second and
  4 seconds following the preceding failed attempt. Existing session recovery may
  refresh and retry a 401 once within an attempt. Only one burst runs at a time
  for the current account. Known-offline state prevents new attempts; errors retain
  local proxy identity and do not fail sign-in. Exhausted/interrupted bursts restart
  on offline-to-online transition or non-active-to-active transition. A burst with
  no local ID yet ends without consuming attempts and restarts when one appears.
  Events during a burst coalesce; polling and same-account token refresh do not
  reset its budget. A successful sync is not repeated until the account session
  changes or the provider remounts. Retries and completion are in-memory, not durable.
- Sign-out invalidates sync immediately, before upstream auth cleanup; account
  changes and provider teardown also invalidate old work. Auth-provider hint deletion
  failure is diagnostic-only: hosted session cleanup still runs, and runtime auth
  caches clear in `finally` without immediately restoring from the stale hint.
  Late endpoint results
  cannot publish identity. Initialization, fallback persistence, and reconciliation
  share a serialized SecureStore queue. A write already in progress cannot be
  canceled, so a superseded write restores the prior value before another queued
  reader/writer runs; failed restoration is retried before subsequent operations.
  This is in-process ordering, not a crash-atomic storage transaction. Reconciliation
  cancels older identity queries and only caches a successfully persisted, still-current
  result. A fallback is generated only after confirmed absence, never during a read.
- `reconcileAndroidPersonalCompartmentId` returns the shared
  `PersonalCompartmentReconciliationResult`: `committed`, `stale` (scope lost), or
  `unavailable` (storage failure or unsupported web persistence). Optional native
  parameters represent an absent compartment ID as `undefined`, never `null`.
- Hosted snapshots never independently select Android sharing identity. Reconciliation
  changes desired configuration only; native readback remains the sharing authority.
- Android `proxyState.data.pairingConfiguration` is native readback:
  `{ revision, status: "persisted" | "applying" | "applied", personalCompartmentId }`.
  Revisions increase across service instances within a device boot. Older revisions
  are ignored; repeated current readback can refill a cleared cache. Missing readback
  or `applying` means no shareable identity.
- `applied` means the configuration passed to the core was accepted by a successful
  `startTunneling`/`restartPsiphon` return, **not** broker announcement or health.
  Each attempt requires fresh `getPsiphonConfig` readback; without it sharing remains
  unavailable, even if the core call returns successfully. A fresh null ID is valid readback.
  `persisted` means the core is stopped and the identity is read from native settings
  for next start. Failed restart remains unshareable until actual stop completes.
  Unchanged parameters still publish readback; listener registration and foreground
  refresh return the current readback, including restored native settings.
  Observation teardown/foreground refresh clears the share cache pending readback;
  service disconnection emits unavailable state. Native identity is never persisted
  in the React Query cache across app launches.
  Invalid proxy-state payloads clear the share cache and log a payload-free diagnostic;
  valid current readback can recover it without requiring a newer revision.
- `paramsChanged` keeps its existing dispatch-only promise. Desired React state and
  that promise are never application acknowledgements. Async parameter loads/selections
  discard superseded work before native dispatch.
- `InproxyProvider` accepts an optional `ConduitModuleAPI` adapter; by default it
  uses `getConduitModule()` to resolve native/simulator code at mount time. The
  existing `ConduitModule` facade and Expo bridge method signatures remain available.
- The share modal subscribes to current platform identity and wrapper URL while open.
  Pairing IDs are private; neither the ID nor previews belong in diagnostics.

Dependencies: `src/hosted/contracts.ts`, `src/hosted/sessionQueries.ts`,
`src/personalCompartmentId.ts`, `src/inproxy/types.ts`,
`modules/expo-psiphon-tunnel-core/index.ts`, existing proxy-state AIDL callbacks.
