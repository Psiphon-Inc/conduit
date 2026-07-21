# Conduit Maestro UI tests

End-to-end UI tests for the Conduit app, written as
[Maestro](https://docs.maestro.dev/) flows. They drive a **real E2E build**
against the **dev Conduit server**, using RevenueCat **TestStore** for storeless
purchases and Clerk **email-code** sign-in for auth.

- App id: `ca.psiphon.conduit`
- Runs on **Android and iOS** (native-first; web is a later phase), locally or on
  **Maestro Cloud**

## Layout

```
maestro/
  config.yaml          # appId, flow order, shared env defaults
  flows/
    smoke/             # cold-launch reaches an interactive shell
    onboarding/        # first-run onboarding
    local/             # Android-only: local conduit (real + mock proxy)
    hosted/            # setup, sign-in, purchase, dashboard, account
  subflows/            # reusable building blocks invoked via runFlow
    reset-app, launch, wait-for-ready, onboarding-complete, go-to,
    sign-in-e2e, purchase-plan, delete-account, select-text
```

Subflows are composed with `runFlow` and never run on their own.

## Status

The harness, app instrumentation, E2E email-code auth path, local simulator
runner, and cloud runner are in place. Hosted sign-in, purchase, and real-proxy
stateful flows require the external dev services listed below plus the
appropriate account/subscription preconditions.

## Build requirements

Flows need a dedicated **E2E build** (`EXPO_PUBLIC_E2E=true`), pointed at the
**dev** Conduit server via your gitignored `.env.e2e` / local env. The
`scripts/e2e-build.sh` and `scripts/e2e-cloud.sh` helpers load `.env.e2e` when it
exists, then force the build-only E2E flags inline. Use a device/emulator with
**no enrolled biometrics**.

`EXPO_PUBLIC_*` vars are inlined at build time, so a config change needs a rebuild.

- **Android (real proxy):**
    ```sh
    scripts/e2e-build.sh android-real
    # -> conduit-e2e-real.apk
    ```
- **Android (mock proxy, deterministic local flows):**
    ```sh
    scripts/e2e-build.sh android-mock
    # -> conduit-e2e-mock.apk
    ```
- **iOS / Maestro Cloud:** a **simulator** `.app`, zipped (not a device IPA)
    ```sh
    scripts/e2e-build.sh ios
    # -> conduit-sim.zip
    ```

> The installed Play/dev build does NOT have the testIDs or E2E behaviour - you
> must install one of the builds above for the flows to pass.

Android E2E APKs are release builds marked `debuggable` (via
`-PconduitE2eDebuggable=true`): the RevenueCat SDK hard-blocks Test Store
(`test_*`) API keys in non-debuggable builds with a fatal "Wrong API Key"
dialog. The iOS simulator build has the same restriction compiled into the
RevenueCat pod under `#if !DEBUG`; Release simulator builds cannot use a Test
Store key until that is addressed (e.g. building the pod with DEBUG defined
for E2E).

## Running locally

```sh
scripts/dev-sim.sh up
scripts/dev-sim.sh test maestro/flows/smoke/launch-ios.yaml
npm run dev:rebuild     # reinstall current app if the simulator falls back to a stale embedded bundle

# Always pass --device: with both an Android emulator and an iOS sim available,
# Maestro grabs whichever it finds first.
maestro --device <udid> test maestro/flows/smoke/launch-android.yaml
maestro --device <udid> test maestro                       # whole suite
maestro --device <udid> test --include-tags=smoke maestro
maestro --device <udid> test --exclude-tags=destructive maestro
MAESTRO_DEVICE=<ios-udid> npm run e2e:smoke:safe:ios
MAESTRO_DEVICE=<android-udid> npm run e2e:safe:android
```

`scripts/dev-sim.sh` also loads `.env.e2e` before starting Metro or building the
local iOS app. If `.env.e2e` changes, `doctor` / `test` restart Metro so the next
bundle is built with the new dev-service values. Use `dev:test` for the
Metro-backed local loop; the raw `e2e:*` wrappers assume an E2E build is already
installed and do not manage Metro.

## Running on Maestro Cloud

```sh
scripts/e2e-cloud.sh            # build binaries + run non-destructive suite on Cloud
scripts/e2e-cloud.sh --ios
scripts/e2e-cloud.sh --android-real --skip-build
scripts/e2e-cloud.sh --android-mock
scripts/e2e-cloud.sh --android-real --destructive
```

By default, Android Cloud uses the **real** APK (`conduit-e2e-real.apk`). The
mock APK is opt-in only via `--android-mock`; it exists as a deterministic UI
harness for mock-proxy flows, not as the primary validation target.

Safe Cloud jobs stage exact flow folders instead of relying on broad tag
selection. Android real currently runs `launch-android`, `first-run`, and
`hosted/setup`; iOS runs the corresponding safe iOS flows. Passing
`--destructive` adds separate purchase-only jobs rather than making the safe jobs
destructive.
`scripts/e2e-cloud.sh` requires `MAESTRO_CLOUD_PROJECT_ID` to be set in the
environment to your Maestro Cloud project ID.

## Tags

- `smoke` — fast happy-path checks (cold launch, sign-in, purchase happy path).
- `onboarding`, `local`, `hosted` — by feature area.
- `hosted/setup.yaml` is non-destructive and only verifies the hosted setup
  screen is reachable; sign-in and purchase flows are separate.
- `local-mock` / `local-real` — Android local conduit against the mock vs real
  proxy build.
- `destructive` — creates/deletes real accounts on the dev backend (purchase +
  delete-account). Exclude on shared envs unless self-cleaning.
- `requires-hosted-state` — manual follow-up flows that expect an already signed
  in / active hosted account.
- `oauth` — opt-in provider canaries for Google/Apple social sign-in. These are
  excluded from safe/Cloud defaults because they depend on external provider UI,
  browser/native account state, consent prompts, and provider-side security
  checks.
- `android` / `ios` — platform-specific entry flows.

## Auth (no secret needed)

Sign-in uses Clerk **test mode** (on by default for dev instances): a unique
`<prefix><ts>+clerk_test@example.com` test email (the unique part is the prefix
**before** the `+clerk_test` subaddress) verified with the fixed OTP `424242`.
No real email is sent and no secret is injected. The dev Clerk instance must have
**Email verification code** enabled and a JWT template named `hcb`.

For manual debugging with a fixed test account, run the preserve flow with
`TEST_EMAIL`; if that address already exists, the app falls back from email-code
sign-up to email-code sign-in and leaves the account intact:

```sh
TEST_EMAIL=qa+clerk_test@example.com \
  npm run dev:test -- maestro/flows/hosted/sign-in-preserve.yaml
```

Use `maestro/flows/hosted/sign-in.yaml` for generated test emails only; that
flow deletes the account at the end.

### OAuth canaries

The default hosted login path intentionally uses Clerk email-code test mode so
the main suite exercises our real Clerk session handoff without depending on
Google/Apple UI state. Real provider OAuth should live in separate
`oauth`-tagged canary flows once the Clerk dev instance has Google/Apple social
connections enabled and the simulator/cloud device has suitable provider test
accounts. Google is the better first canary; Apple native sign-in is more
platform-state dependent and may need physical-device coverage before release
confidence.

## Cross-platform handling (Android <-> iOS)

Branch with `when: { platform: Android|iOS }`.

- **`hideKeyboard` is Android-only.** Conduit uses `react-native-keyboard-controller`;
  on iOS the submit/Continue tap dismisses the keyboard itself.
- **iOS text inputs:** wait on the screen marker (`hosted-setup-ready`), then tap
  E2E input accessibility labels by `text:`; native `TextInput` ids are not always
  surfaced as Maestro `id:` selectors.
- **Match list rows with `.*${NAME}.*`** — iOS merges row a11y labels.
- **Clipboard:** Maestro can't set the OS clipboard. Copy flows stage the value
  in a real field and use `select-text.yaml` (Android native toolbar / iOS
  triple-tap), or assert the share sheet — no test-only UI.
- **First-tap-eats-keyboard (iOS):** add an extra iOS-only tap when opening a row
  with the keyboard up.

## Gotchas

- **Never give a subflow an `env:` default for a value the caller provides.** A
  subflow-local `env:` entry _overrides_ the caller's value and any inherited
  variable. Subflows here have no `env:` blocks; they read inherited `output.*`
  (set by a parent via `evalScript`) and CLI `-e` vars directly.
- **Prefer `id:` over visible text.** Text selectors are brittle (i18n, Skia
  canvas icons have no text node).
- **`app-ready` is an E2E shell marker.** Hosted-specific flows should continue
  waiting on `hosted-setup-ready`, `hosted-active`, account, or dashboard markers
  before making hosted-state assertions.
- **State markers need visible bounds on Android.** E2E-only shell-root markers
  such as `local-pairing-ready`, `conduit-running`, and `hosted-api-offline` are
  intentionally nonzero so Maestro's Android visibility checks can resolve them.
- **Do not gate mock local toggle on personal pairing.** `app-ready` only proves
  the shell mounted. `local/toggle` then taps the orb and waits for
  `conduit-running` in the mock APK. `wait-for-local-pairing-ready.yaml` is for
  flows that actually open/share personal pairing.
- **Do not assert real proxy running without real preconditions.** The real APK
  Cloud baseline stops at safe app/onboarding/hosted setup coverage. Real
  `conduit-running` coverage needs a signed-in hosted state, active
  subscription/pairing, and proxy startup path established by the flow.
- **Reset isolation:** destructive/account flows start from `reset-app`
  (`clearState` + iOS `clearKeychain`).

## Adding a new flow

1. Reuse subflows: `reset-app`, `launch`, `wait-for-ready`, `onboarding-complete`,
   `sign-in-e2e`, `go-to` (DEST), `purchase-plan`, `delete-account`, `select-text`.
2. Add a `testID` to any new control you tap (`area-action`, e.g. `settings-save`);
   keep changes to shared primitives as optional `testID` passthrough props.
3. Platform-gate keyboard/text-selection steps; match rows with wildcard regex.
4. Tag it; if it mutates backend state, make it clean up after itself.
