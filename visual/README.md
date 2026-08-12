# Visual golden-state harness

Deterministic screenshot capture and comparison for Conduit's orb rendering,
built for the React Native Skia migration
(`docs/plans/react-native-skia-migration.md`). The native renderer's output
is the accepted golden set; the pre-migration Skia captures are archived
under `visual/baselines/skia` and can still be compared against with
`node visual/compare.mjs --baseline=skia`.

## Layout

```text
visual/
|-- baselines/native/{mobile,desktop}/<scenario>.png  accepted goldens (committed)
|-- baselines/skia/...                               archived pre-migration reference
|-- tolerances.json                                  optional per-scenario tolerances
|-- capture.mjs, compare.mjs, lib.mjs                toolchain
`-- README.md

artifacts/visual-diff/          gitignored
|-- current/<renderer>/...      latest captures
|-- diff/...                    difference heat maps
`-- reports/report.{json,html}  comparison reports
```

Scenarios are defined once, in
`src/components/orb-scene/visualScenarios.ts`. The capture scripts read the
registry from the running lab page, so there is no second copy to keep in
sync. Scenario ids are baseline filenames — renaming one orphans its golden.

## Quick start

```sh
# 1. Serve the web app (no browser window is opened; port 8090)
npm run visual:serve

# 2. Capture the renderer into artifacts/
npm run visual:capture-native

# 3. Compare captures against accepted goldens
npm run visual:compare
open artifacts/visual-diff/reports/report.html
```

Point the tools at a different server with `CONDUIT_WEB_URL=http://...`.

`visual:compare` compares `current/native` against the accepted native
goldens; `--baseline=skia` targets the archived pre-migration captures.

## The lab route

`/orb-lab` is a development-only web route (enabled under `__DEV__` or
`EXPO_PUBLIC_VISUAL_LAB=1`; it redirects home otherwise and is a no-op on
native). All state lives in the URL, so any view is shareable:

```text
/orb-lab?scenario=two-first-contact&renderer=skia&progress=0.45
/orb-lab?scenario=swap-050&renderer=compare&viewport=desktop
/orb-lab?scenario=light-touching&renderer=overlay&overlay=0.4
```

Params: `scenario`, `renderer` (`skia | native | compare | overlay`),
`progress` (0..1 frozen scrub), `play=1` (live animation), `viewport`
(`mobile | desktop | fit`), `bg` (`black | white | mauve`), `theme` (0-3
override), `overlay` (top-layer opacity), `chrome=0` (controls hidden, used
for capture).

## Determinism

Scenarios render with `visualTest={ frozen: true, progress }`
(`src/components/orb-scene/visualTestControl.ts`), which pins every
autonomous animation source:

- the scene light clock (`useFrameCallback`) is stopped and set to
  `progress * 20s`
- entry fades, springs, theme timings, and mode transitions resolve to their
  targets instantly
- slot swaps sit mid-arc at exactly `progress`, using the same sine-arc
  geometry as the animated path
- provisioning markers orbit to `progress`
- connection lights are seeded (`connectionLightSeed`) instead of
  `Math.random`, and reduced-motion is pinned to a scenario-controlled value

`visualProgressForLightLfo()` solves for the progress that places a given
light at a target trajectory LFO (-1 spawn, -0.6 orb edge, 0 center), which
is how the `light-*` scenarios pin approach/contact/absorption states.

Capture waits for `[data-visualready="true"]`, set only after fonts resolve
and the frozen scene has settled, then screenshots the
`[data-visualstage="<renderer>"]` element. Repeat captures of the same
commit are byte-identical.

## Baseline policy

- `visual:capture-*` and `visual:compare` never write to `visual/baselines/`.
- Goldens change only via the explicit `npm run visual:update-baselines`,
  and those diffs are reviewed like code.
- There is intentionally no universal pass/fail pixel threshold: CanvasKit
  and DOM/SVG antialiasing legitimately differ. Add opt-in, scenario-specific
  tolerances to `visual/tolerances.json` after observing real output:

  ```json
  { "mobile/swap-050": { "maxChangedPct": 1.5 } }
  ```

  Comparisons exceeding an explicit tolerance (or missing images) fail the
  run; everything else is reported for human review. Human approval remains
  authoritative for metaball and glow states.

## Browser isolation

Capture always runs the Playwright-managed headless Chromium
(`npx playwright install chromium`) with a fresh ephemeral profile per run.
It never launches or reads your own Chrome installation or profiles. Note
that `npm run web` (unlike `visual:serve`) passes `--web` to Expo, which
auto-opens your default browser.

## Adding a scenario

1. Add an entry to `ORB_VISUAL_SCENARIOS` in
   `src/components/orb-scene/visualScenarios.ts` (unit tests validate ids,
   progress range, and orb references).
2. Inspect it interactively at `/orb-lab?scenario=<id>` and scrub `progress`
   to the state you want frozen.
3. Run `npm run visual:update-baselines` and commit the new goldens with the
   scenario.

## Caveats

- Goldens are captured on macOS Chromium at `deviceScaleFactor: 1`. Other
  OS/GPU stacks may rasterize CanvasKit slightly differently; recapture
  baselines rather than comparing across machines.
- The `native` renderer is a placeholder panel until the migration's native
  orb primitives land (plan phases 5-8).
