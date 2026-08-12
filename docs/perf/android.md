# Android performance instrumentation

The canonical before/after procedure is the
[performance measurement playbook](measurement-playbook.md). This page only
documents the lower-level tools.

Performance instrumentation is opt-in at bundle time. Normal `npm run android`
builds do not mount the frame sampler, use the mock provider, or install the
isolated `ca.psiphon.conduit.perf` package.

## Build targets

```sh
# Seven deterministic moving lights: use for strict before/after comparisons
npm run perf:build:android:mock

# Three orbs, two active lanes, 19 moving lights: use as a stress test
npm run perf:build:android:stress
```

Both targets make an embedded production bundle, enable `[PERF]` sampling, and
build only `arm64-v8a` by default. They install alongside the normal development
app, so running the protocol no longer destroys normal app state.

For a shipping-size comparison, build the same ABI set on both revisions. The
current universal APK configuration is:

```sh
PERF_MOCK=1 \
PERF_ARCHITECTURES=armeabi-v7a,arm64-v8a,x86,x86_64 \
PERF_APK_OUT=conduit-perf-universal.apk \
npm run perf:build:android
```

## Physical-device runner

```sh
PERF_DEVICE=<serial> npm run perf:run:android -- \
  --apk="$PWD/conduit-perf-mock.apk" \
  --label="<git-sha>-baseline" \
  --workload=baseline-seven-light \
  --runs=3
```

The runner requires exactly one attached ADB device. Every repetition fresh
installs the perf package, uses Maestro to complete onboarding and start the
mock, settles for 30 seconds, resets counters, idles for 20 seconds, opens and
closes the orb with fixed ADB coordinates, then idles for 20 seconds.

Results are written to `artifacts/perf-android/<label>/`: raw `gfxinfo`,
`meminfo`, and logcat captures; one JSON document per run; setup screenshots;
and `summary.json` containing three-run medians. The summary also records the
workload, APK SHA-256 and byte size, device/build metadata, animation scales,
thermal status, brightness, and battery-saver state.

The fixed coordinates are calibrated for the Pixel 7. Override
`PERF_ORB_TAP_X`, `PERF_ORB_TAP_Y`, `PERF_MODAL_CLOSE_X`, and
`PERF_MODAL_CLOSE_Y` if the workload layout changes.

## Interactive instrumentation

For exploratory development builds, these older commands remain available:

```sh
npm run perf:reset
npm run perf:report
npm run perf:session
```

They are useful for diagnosis, but their output is not a substitute for the
fresh-install, fixed-workload, three-run comparison protocol.
