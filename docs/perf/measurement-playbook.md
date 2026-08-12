# Performance measurement playbook

Use this protocol whenever a code change might affect rendering, memory, or
binary/bundle size. A valid comparison changes one thing at a time: the source
revision. Device, workload, build flags, ABI set, taps, dwell times, and capture
point must remain identical.

## 1. Name and freeze the comparison

Record both git SHAs and choose one workload before building:

| Workload                 | Scene                                               | Purpose                                      |
| ------------------------ | --------------------------------------------------- | -------------------------------------------- |
| `baseline-seven-light`   | One main orb with seven deterministic moving lights | Historical and routine regression comparison |
| `active-stress-19-light` | Three orbs, two active lanes, 19 moving lights      | High-load animation regression test          |

Never compare the baseline result with the stress result. If a proposed change
needs a new workload, give it a stable name and run that same workload on both
revisions.

Use separate worktrees so each revision has its matching `node_modules` and
native dependency graph. Run `npm ci` in each when the lockfile differs.

## 2. Prepare the Pixel once

- Kill Metro. The APKs must use embedded production bundles.
- Confirm `adb devices` shows only the intended physical Pixel 7.
- Plug the phone in, set fixed manual brightness, and disable battery saver.
- Turn Settings > Accessibility > Remove animations **off**. Keep all three
  Android animation scales at `1.0`.
- Unlock the device and keep ambient/device temperature as stable as practical.
- Do not begin one side of a comparison under thermal throttling. The runner
  records Android's thermal status with every result.

Alternate before/after runs when practical (`A1, B1, A2, B2, A3, B3`) to reduce
temperature and time drift. Otherwise let the device return to the same thermal
status before starting the second APK.

## 3. Build both revisions identically

For the routine seven-light comparison:

```sh
npm run perf:build:android:mock
```

For the 19-light stress comparison:

```sh
npm run perf:build:android:stress
```

These create signed, production-bundled, arm64 APKs with an isolated
`ca.psiphon.conduit.perf` application ID. Rename/copy each APK to include its git
SHA before switching worktrees.

APK size is meaningful only when both APKs use the same ABI set, signing mode,
minification settings, and build variant. For shipping-size checks, produce a
universal APK on each revision:

```sh
PERF_MOCK=1 \
PERF_ARCHITECTURES=armeabi-v7a,arm64-v8a,x86,x86_64 \
PERF_APK_OUT=conduit-perf-universal.apk \
npm run perf:build:android
```

The runner records exact APK bytes and SHA-256. Do not compare its default
arm64-only size with a historical universal APK.

## 4. Run three fresh repetitions per APK

Baseline example:

```sh
PERF_DEVICE=<serial> npm run perf:run:android -- \
  --apk=/absolute/path/<sha>-baseline.apk \
  --label=<sha>-baseline \
  --workload=baseline-seven-light \
  --runs=3
```

Stress example:

```sh
PERF_DEVICE=<serial> npm run perf:run:android -- \
  --apk=/absolute/path/<sha>-stress.apk \
  --label=<sha>-stress \
  --workload=active-stress-19-light \
  --runs=3
```

Each repetition performs a fresh uninstall/install, completes onboarding with
Maestro, waits 30 seconds beyond first paint, resets `gfxinfo` and logcat, idles
20 seconds, opens and closes the same orb, and idles another 20 seconds. Memory
is captured at that final settled point. The measured interaction uses fixed
ADB taps because restarting Maestro's physical-device driver can interrupt ADB
and contaminate the capture window.

Inspect each setup screenshot before accepting a run. Reject and rerun any
sample with the wrong screen, interrupted animation, notification shade,
device lock, provider failure, or changed thermal state. Keep the raw rejected
sample but do not silently mix it into the median.

## 5. Compare medians

Use the median of three accepted runs. Lower is better for every metric below.

| Category          | Primary metrics                                                  | Why                                                         |
| ----------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Frame time        | p50, p90, p95, p99                                               | Shows both steady-state cost and tail latency               |
| Jank              | janky %, >20 ms/1000 frames, >33 ms/1000 frames                  | Normalized spikes users perceive                            |
| Scheduling        | missed vsync, slow UI thread, frame deadlines missed             | Distinguishes deadline pressure from ordinary frames        |
| In-app UI sampler | frames, >20 ms, >33 ms                                           | Catches UI-worklet stalls `gfxinfo` may miss                |
| Memory            | total PSS, total RSS, graphics PSS/RSS, native heap, bitmap KB   | Separates process footprint from graphics-heavy regressions |
| Android size      | exact signed APK bytes                                           | Detects native dependency and packaged-asset changes        |
| Web size/startup  | export bytes, entry JS raw/gzip, large assets/wasm, startup gate | Detects JS/assets and first-paint blockers                  |

Report rates rather than raw slow-frame counts when total frame counts differ:

```text
slow frames per 1000 = slow frames / total frames * 1000
relative change (%)  = (after - before) / before * 100
```

For a zero baseline, report the absolute delta instead of a relative percentage.
Do not summarize the result with an average frame time; a change can improve
p99/jank while making ordinary frames slightly slower.

## 6. Measure web output when relevant

Run the same production export command on both revisions and record the same
files:

```sh
npm run build:web
du -sk dist
find dist -type f \( -name '*.js' -o -name '*.wasm' \)
```

Record raw bytes for the complete export, the entry JS bundle, and every large
Wasm/asset. Gzip the same entry file on both sides to compare transfer size.
If startup behavior changed, use `npm run visual:perf` on the same machine and
browser version; report its first-render gate and fixed five-second animation
windows separately from Android device measurements.

## 7. Store a reproducible report

Keep `artifacts/perf-android/<label>/summary.json` and the raw files for both
sides. In the human-readable report include:

- before/after git SHA and APK SHA-256;
- device model, serial, Android version/build fingerprint;
- workload name and exact interaction/dwell sequence;
- build variant, ABI set, mock/real provider, and Metro state;
- brightness mode/value, battery saver, animation scales, and thermal status;
- accepted/rejected runs and median table;
- absolute and relative deltas, including any regressions.

The migration's worked example is in
[Skia migration performance results](skia-migration-results.md).
