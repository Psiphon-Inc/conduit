# Visual golden-state harness

Deterministic screenshot capture and comparison for Conduit's orb rendering,
built for the React Native Skia migration
(`docs/plans/react-native-skia-migration.md`). Baselines are generated locally
when a visual comparison is needed and are intentionally not committed.

## Layout

```text
visual/
|-- baselines/native/{mobile,desktop}/<scenario>.png  local, gitignored goldens
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

# 2. Generate a local baseline, then capture the renderer into artifacts/
npm run visual:update-baselines
npm run visual:capture-native

# 3. Compare captures against the local goldens
npm run visual:compare
open artifacts/visual-diff/reports/report.html
```

Point the tools at a different server with `CONDUIT_WEB_URL=http://...`.

`visual:compare` compares `current/native` against the locally generated
native goldens.

## The lab route

`/orb-lab` is a development-only web route (enabled under `__DEV__` or
`EXPO_PUBLIC_VISUAL_LAB=1`; it redirects home otherwise and is a no-op on
native). All state lives in the URL, so any view is shareable:

```text
/orb-lab?scenario=two-first-contact&skin=classic-dark&progress=0.45
/orb-lab?scenario=swap-050&skin=current&viewport=desktop
/orb-lab?scenario=light-touching&skin=classic-dark&chrome=0
```

The lab uses the production SVG/native/Reanimated renderer only. Params: `scenario`,
`progress` (0..1 frozen scrub), `play=1` (live animation), `viewport`
(`mobile | desktop | fit`), `bg` (`black | white | mauve`), `theme` (0-3
override), `skin` (`current | classic-dark`), `chrome=0` (controls hidden, used
for capture).

Skin is a URL-only preview: it never reads or changes the saved Settings choice.
Missing or invalid skin selects Current. Current retains the lab's original
`black` background (#231F20); Classic Dark defaults to true black (#000000).
An explicit `bg` overrides either. Readiness resets when the skin changes.
For full app inspection, use Settings → Appearance, then return Home or Account;
the selection applies immediately and survives a reload. QR codes and sign-in
brand badges intentionally retain their original high-contrast colors.

Run `CONDUIT_WEB_URL=http://localhost:8090 node visual/verify-skins.mjs` for a
browser smoke test of click/keyboard selection, reload persistence, invalid
localStorage fallback, and non-persisting lab previews. It saves Settings/Home
screenshots and eight deterministic scenes per skin under
`artifacts/visual-diff/skins/`. Production exports must enable the lab with
`EXPO_PUBLIC_VISUAL_LAB=1` when building.

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
- Generate or refresh local goldens explicitly with
  `npm run visual:update-baselines`. The output is gitignored.
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
3. Run `npm run visual:update-baselines` when you need a fresh local comparison
   set.

## Caveats

- Goldens are captured on macOS Chromium at `deviceScaleFactor: 1`. Other
  OS/GPU stacks may rasterize differently; recapture baselines rather than
  comparing across machines.
- The `native` renderer is a placeholder panel until the migration's native
  orb primitives land (plan phases 5-8).
