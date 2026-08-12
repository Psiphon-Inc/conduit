# Web performance baseline — Skia renderer

Phase 0 baseline for the React Native Skia migration
(`docs/plans/react-native-skia-migration.md`). Captured 2026-08-10 on macOS
(Apple Silicon), headless Chromium 151 via `npm run visual:perf`, dev server
(`npm run visual:serve`), mobile viewport 390x844, 5s live-animation sampling
windows. Dev-bundle numbers: meaningful for before/after comparison on the
same machine, not as absolute production performance.

The replacement renderer is measured with
`node visual/perf.mjs --renderer=native` and compared against this table.

## Startup (dev server, warm Metro cache)

| Metric                                                     |    Value |
| ---------------------------------------------------------- | -------: |
| Page `load` event                                          |  ~300 ms |
| CanvasKit fetch + compile (`window.__CANVASKIT_LOAD_MS__`) |  ~145 ms |
| Navigation to frozen-scene ready (`data-visualready`)      | ~1520 ms |

CanvasKit initialization blocks first render entirely (see
`src/entrypoint.web.js`): nothing paints until the wasm resolves. The native
renderer removes this step from the critical path.

## UI-thread frame stats (Reanimated sampler, 5 s windows)

| Workload                               | avg ms | worst ms | >20 ms | >33 ms |
| -------------------------------------- | -----: | -------: | -----: | -----: |
| `single-active` (one idle orb)         |  16.66 |     17.7 |      0 |      0 |
| `lights-multi-lane` (3 orbs, 7 lights) |  17.01 |      100 |      2 |      2 |
| `lights-multiple` (5 lights, 1 orb)    |  16.89 |       50 |      3 |      2 |
| `swap-050` (slot swap then idle)       |  16.67 |     17.7 |      0 |      0 |
| `scene-blur` (orb behind scene blur)   |  16.84 |     33.4 |      3 |      3 |
| `mini-active` (hosted mini orb)        |  16.67 |     17.7 |      0 |      0 |

Steady state is a clean 60 fps; the multi-light and scene-blur workloads
show occasional long frames (mount/steady-state transitions and blur
compositing). Acceptance for the replacement renderer: no increase in

> 20 ms / >33 ms buckets, equal or better worst-frame during swaps and
> multi-light motion.

## Production web export (`npm run build:web`)

| Artifact                        |   Size | Gzipped |
| ------------------------------- | -----: | ------: |
| `dist/` total                   |  15 MB |       — |
| `dist/canvaskit/canvaskit.wasm` | 8.1 MB |  3.1 MB |
| entry JS bundle                 | 5.1 MB |  1.3 MB |

CanvasKit is ~54% of the raw export and ~70% of the compressed
first-load payload. Removing it is the migration's headline web win.

## Native baseline

Native numbers are collected with the same probe through
`npm run perf:session` (see `scripts/perf-android.mjs`): it clears device
counters, waits for an instrumented interaction (e.g. the existing Maestro
performance-state flows), then prints the in-app `[PERF]` summaries plus
`dumpsys gfxinfo` RenderThread percentiles. Record device results here
before flipping the production renderer (plan phase 9):

Pixel 7 (`panther`), signed release APK, `dumpsys gfxinfo` RenderThread:

| Workload                      | Frames | Janky | 50th |  90th |  99th | Missed vsync |
| ----------------------------- | -----: | ----: | ---: | ----: | ----: | -----------: |
| Startup + onboarding + home   |   9789 | 0.58% | 9 ms | 13 ms | 19 ms |            4 |
| Onboarding animation sequence |    571 | 0.35% |    — | 10 ms | 12 ms |            0 |

Against a 16.67 ms budget the animated onboarding sequence stays inside
frame time with no missed vsyncs. Caveat: `gfxinfo` measures the
RenderThread only, so it cannot see Reanimated worklets stuttering on the
UI thread — trust it for compositing cost, not for perceived smoothness.

Still to measure on-device: the main scene under load (three orbs,
multiple connection lights, slot swaps), reachable via
`EXPO_PUBLIC_DEV_SIMULATED_DATA` or the Maestro performance-state flows.

## Accepted differences from Skia (native renderer)

Reviewed on a Pixel 7 at 1080x2400. A real device at real scale showed
differences the frozen 390x844 golden comparisons did not, which is the
main testing lesson here: golden percentages are not a sufficient
acceptance signal for this scene. The pre-switch native-vs-Skia
comparison ran 0.0-1.1% changed pixels against 2% tolerances — close on
frozen frames, yet visibly different in motion at device scale.

### Resolved after device review

- **Orb body flatness and hard rim.** The profile originally applied
  Skia's literal `5a - 2` alpha threshold to a 1D radial slice. That
  threshold worked in Skia because it ran on a 2D screen-space field
  where overlapping contributions pushed alpha past its knee; a radial
  slice peaks near 0.45, so the result was an 0.01-0.22 interior with a
  bright ring at r≈0.91 and a cliff to zero at the rim. Replaced with a
  density lift plus a smoothstep falloff (`CORE_DENSITY`,
  `RIM_SOFTNESS` in `orbBodyProfile.ts`).
- **Lights sitting on top of the orb.** Lights now render behind the
  bodies. The bodies are translucent (~20-25% alpha at centre, ~65% at
  the rim), so a light crossing the rim dims and tints through the shell.
- **Absorption neck reading as a hard slab.** The mask's cross-section
  was clamped to full opacity; it now peaks at `TAIL_PEAK_ALPHA` (0.72)
  and fades along its length.

### Accepted as permanent

- **No true multi-body fusion.** Architectural, not tuning: Skia blurred
  and thresholded the whole layer in screen space, merging every body and
  light into one alpha field. Per-element gradients and sprites have no
  shared field to merge into. Device review found that capped pairwise
  bridges read as a white overlap ring and added avoidable work, so they were
  removed; orb bodies now overlap naturally, while light absorption keeps its
  rim-anchored neck. Recovering true fusion would require a shader stack,
  which the migration plan ruled out. **Accepted.**
- **Scene blur** is a 78% opacity dim rather than a gaussian. Adding a
  live-blur dependency was explicitly out of scope (plan phase 8).

## Native build status

Post-removal build verification (2026-08-10, macOS, Xcode 26.6):

- **Android**: `./gradlew assembleRelease` succeeds. The release APK
  contains zero Skia and zero CanvasKit entries — the removal is verified
  at the binary level, not just in source. Remaining large `.so` payloads
  are `libgojni` (Psiphon tunnel-core), `libreactnative`, and `libhermes`.
  Two prerequisites are gitignored and so are absent from a fresh
  worktree: `android/local.properties` (`sdk.dir=...`) and
  `modules/expo-psiphon-tunnel-core/android/src/main/res/raw/`
  (`android_psiphon_config`, `android_embedded_server_entries`).
- **iOS**: blocked by a **pre-existing** failure unrelated to this
  migration. `Pods/fmt` (11.0.2) fails to compile under Xcode 26.6 with
  `call to consteval function ... is not a constant expression` in
  `format-inl.h` (5 errors, arm64 and x86_64 alike). Untouched `main`
  fails identically at the same source lines, and the `fmt` version and
  checksum match between checkouts, so `pod install` did not introduce it.
  Fixing it means bumping `fmt`, adding a Podfile post-install workaround
  for that target, or using an older Xcode — all out of scope here.

`ios/Podfile.lock` was regenerated as part of the removal; it had still
pinned `react-native-skia (2.4.7)`.

The completed physical-device comparison and reusable protocol are recorded in
[Skia migration performance results](skia-migration-results.md) and the
[performance measurement playbook](measurement-playbook.md). An iOS build is
still outstanding until the pre-existing `fmt` issue is resolved.

## Reproducing

```sh
npm run visual:serve          # dev server on :8090, no browser window
npm run visual:perf           # startup + frame sweep -> artifacts/perf/
npm run build:web && du -sh dist                   # export size
npm run perf:session          # native, with a device attached
cd android && ./gradlew assembleRelease            # native Android build
```

## Post-migration result (Skia and CanvasKit removed)

Measured after plan phase 10 on the same machine and method:

| Metric                              |          Skia baseline |    Native renderer |
| ----------------------------------- | ---------------------: | -----------------: |
| `dist/` total                       |                  15 MB |             6.5 MB |
| CanvasKit wasm                      |     8.1 MB (3.1 MB gz) |            removed |
| Entry JS bundle                     |     5.1 MB (1.3 MB gz) | 4.5 MB (1.2 MB gz) |
| CanvasKit init blocking first paint |                ~145 ms |            removed |
| Frames > 20 ms across all workloads | up to 3 per 5 s window |                  0 |
| Worst frame (multi-light)           |                 100 ms |            17.7 ms |
