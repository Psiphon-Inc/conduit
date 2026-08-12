# React Native Skia Migration Plan

Status: Proposed  
Last updated: 2026-08-10

## Summary

Remove `@shopify/react-native-skia` and CanvasKit from Conduit while preserving
the application's visual identity, animation model, interaction behavior, and
web compatibility.

The replacement rendering stack will use:

- React Native views
- React Native Reanimated
- `expo-image`
- `react-native-svg`
- `expo-linear-gradient`
- Small pre-baked raster assets for glows, noise, orb shading, and metaball
  bridges

Exact pixel parity is not a goal. The migration should preserve recognizable
shape, color, motion, layering, and visual character while simplifying complex
effects where necessary. In particular, arbitrary three-body liquid fusion may
be approximated with capped pairwise bridges.

Skia will remain temporarily available as a visual oracle while the replacement
renderer is developed. It will be removed only after the replacement passes web
golden-state comparisons and native performance and interaction checks.

## Goals

- Remove all production use of `@shopify/react-native-skia`.
- Remove CanvasKit initialization and assets from the web application.
- Preserve web as a fully supported platform.
- Preserve existing application state, navigation, gesture, accessibility, and
  connection-light behavior.
- Reuse the current Reanimated state machines, worklets, geometry, and motion
  calculations wherever possible.
- Establish deterministic visual golden states before changing rendering.
- Provide a fast local web loop for comparing the legacy and replacement
  renderers.
- Measure native and web performance before and after the migration.
- Keep the application runnable and reviewable throughout the work.

## Non-goals

- Pixel-perfect reproduction of CanvasKit antialiasing, blur falloff, or color
  compositing.
- A new general-purpose shader, WebGL, or custom native rendering system.
- A redesign of the orb scene or onboarding experience.
- A rewrite of business state, hosted state, routing, or tunnel behavior.
- A mathematically exact recreation of arbitrary multi-body metaballs.
- Using screenshot tests as the primary functional test suite.

## Agreed design decisions

- Perceptual equivalence is sufficient; exact pixel equality is unnecessary.
- A development-only visual harness may be added.
- Golden baselines will target `390x844` mobile and `1280x800` desktop web
  viewports.
- Web compatibility is mandatory throughout the completed migration.
- Metaballs may use sprites and bridge layers.
- Complex three-body overlaps may be simplified.
- Pairwise bridges will be layered for three-body states, with aggregate opacity
  capped to prevent a bright center.
- Engineering questions such as bridge-mask count and PNG tint consistency will
  be answered experimentally through the harness.

## Existing context

Conduit currently uses:

- React Native `0.79.5`
- Reanimated `~3.19.0`
- Gesture Handler `~2.24.0`
- Skia `~2.4.7`
- Expo `^53.0.26`
- `expo-image` `~2.4.1`
- `react-native-svg` `15.11.2`

`expo-linear-gradient` is not currently installed. The related Ryve client uses
it successfully with a comparable Expo and React Native stack.

The original audit found 23 Skia-dependent files covering approximately 9,121
lines. Most uses are simple gradients or vector drawing. The highest-risk areas
are:

- `src/components/orb-scene/OrbScene.tsx`
- `src/components/HostedMiniOrb.tsx`
- `src/app/(app)/onboarding.tsx`
- `src/components/canvas/`
- `src/hosted/dashboard/RegionalWorldMap.tsx`
- `src/components/QRDisplay.tsx`
- `src/components/Icon.tsx`

The repository already has useful test infrastructure:

- Maestro native E2E and performance-state setup flows
- `EXPO_PUBLIC_E2E` behavior that disables unstable animations
- `EXPO_PUBLIC_DEV_SIMULATED_DATA` for exercising multi-orb states
- `OrbScene` props that expose most high-level scene state

It does not currently have deterministic frame scrubbing, a web visual-lab
route, Playwright golden capture, or screenshot-diff tooling.

## Target architecture

The current `OrbScene` combines application-state interpretation, geometry,
animation, Skia rendering, and gesture overlays. Separate those concerns:

```text
Application state
      |
      v
OrbSceneModel / shared animation state
      |
      +-- OrbSceneSkia       temporary reference renderer
      |
      +-- OrbSceneNative     Views, Images, SVG, Reanimated
                |
                +-- NativeOrb
                +-- NativeConnectionLight
                +-- MetaballBridge
                +-- ProvisioningMarker
                +-- Gesture overlays
```

The shared model should own:

- Orb identities and visual modes
- Slot mapping
- Positions and radii
- Theme transitions
- Connection-light trajectories
- Swap progress
- Provisioning-marker progress
- Highlight state
- Reduced-motion behavior

Renderers should receive resolved scene data rather than independently
interpreting application state.

Do not extract the entire model in one preliminary rewrite. First introduce a
narrow deterministic-control seam around the existing renderer. Progressively
extract shared calculations as the native renderer needs them.

## Phase 0: Record the current visual and performance baseline

Capture the existing Skia output before changing production rendering.

### Deterministic visual scenarios

Create a typed scenario registry similar to:

```ts
interface OrbVisualScenario {
    id: string;
    viewport: {
        width: number;
        height: number;
    };
    evolutionLevel: OrbEvolutionLevel;
    themeLevel: OrbEvolutionLevel;
    orbModes: OrbVisualMode[];
    orbSlotMap?: number[];
    localOrbIndex?: number | null;
    highlightedOrbIndex?: number | null;
    activityLanes?: OrbSceneActivityLane[];
    provisioningMarkers?: OrbSceneProvisioningMarker[];
    progress: number;
}
```

Initial scenario matrix:

- Single orb: off, announcing, active
- Two orbs: far, approaching, first contact, strong bridge, overlapping
- Three orbs: idle and pairwise bridge state
- Connection light: far, approaching, touching, absorbed
- Multiple simultaneous connection lights
- Slot swap at progress `0`, `0.25`, `0.5`, `0.75`, and `1`
- Provisioning marker
- Scene blur enabled
- Hosted mini orb idle and active
- Representative light and dark themes

Capture each relevant scenario at:

- Mobile web: `390x844`
- Desktop web: `1280x800`

### Determinism controls

Visual-test mode must eliminate:

- Wall-clock dependence
- Unseeded randomness
- Live network and hosted state
- App lifecycle changes
- Automatically advancing frame callbacks
- Uncontrolled Reanimated timing
- Font and image readiness races

Existing E2E behavior is useful, but it disables too much animation globally.
Add a separate visual-testing mode capable of freezing the animation clock at
an explicit normalized progress value. Connection-light randomness must accept
an explicit seed.

### Performance baseline

Reuse existing Maestro performance flows to prepare native application states.
Add a lightweight development-only Reanimated `useFrameCallback` sampler,
following the existing pattern in the Ryve client.

Measure:

- Average frame duration
- Worst frame duration
- Frames above 20 ms
- Frames above 33 ms
- Mount time
- Responsiveness during orb swaps
- Multiple active connection lights
- Memory where practical
- Web startup and CanvasKit initialization time
- Exported web bundle size
- Native application size

Representative workloads:

- One idle orb
- Three animated orbs
- Multiple connection lights
- Orb slot swap
- Modal/background-blur transition
- Hosted mini orb in a scrolling screen
- Onboarding phone scene

## Phase 1: Build the web visual lab

Add a development-only route conceptually shaped like:

```text
/orb-lab?scenario=two-first-contact&renderer=skia&progress=0.45
/orb-lab?scenario=two-first-contact&renderer=native&progress=0.45
/orb-lab?scenario=two-first-contact&renderer=compare&progress=0.45
```

The route should bypass authentication, hosted APIs, local proxy state, and
onboarding. It should mount renderers directly from deterministic fixtures.

The lab should provide:

- Scenario selector
- Renderer selector
- Progress scrubber
- Play and pause controls
- Mobile and desktop viewport selectors
- Background and theme selector
- Side-by-side comparison
- Opacity-overlay comparison
- Difference-image preview
- Reproducible state encoded in the URL

### Screenshot automation

Add a small Playwright-based toolchain with commands equivalent to:

- `visual:capture-skia`
- `visual:capture-native`
- `visual:compare`
- `visual:update-baselines`

Recommended layout:

```text
visual/
|-- scenarios/
|-- baselines/
|   `-- skia/
|       |-- mobile/
|       `-- desktop/
`-- README.md

artifacts/
`-- visual-diff/       # gitignored
    |-- current/
    |-- diff/
    `-- reports/
```

Baseline updates must require an explicit command. Ordinary comparison runs
must never overwrite accepted goldens.

Playwright should wait for a marker such as `data-visual-ready="true"`. The
marker appears only after:

- CanvasKit initialization
- Font loading
- Image decoding
- Scene state settlement
- Two animation frames after final layout

### Comparison policy

Report:

- Changed-pixel percentage
- Perceptual similarity
- Difference heat map
- Side-by-side images

Do not begin with one universal pass/fail pixel threshold. CanvasKit and DOM/SVG
antialiasing will legitimately differ. Establish scenario-specific tolerances
after observing real output. Human visual approval remains authoritative for
metaball and glow states.

## Phase 2: Migrate simple gradients

Add `expo-linear-gradient`, aligned with the Expo SDK version, and migrate the
low-risk consumers first:

- Account screen background
- Settings screen background
- Hosted dashboard background
- `DropdownSection`
- `HostedSetupSections`
- `RyveCallToAction`
- `SkyBox`

For animated gradients, stack static gradient layers and animate the opacity of
their wrappers. Do not continuously animate gradient color arrays.

For Conduit's four `SkyBox` states, use four static layers and calculate
crossfade weights from the current fractional theme state.

Acceptance criteria:

- Gradient goldens are perceptually approved.
- Safe-area bottom treatment is unchanged.
- Transitions remain smooth on web, iOS, and Android.
- These files no longer import Skia.

## Phase 3: Migrate generic visual primitives

### Icons

Replace Skia SVG loading and blend-mode tinting with:

- `react-native-svg` for icons requiring dynamic fill or stroke
- `expo-image` for static SVG assets
- `tintColor` where consistent
- Animated wrapper opacity for faded icons

Preserve intrinsic aspect ratio, accessibility behavior, and the existing icon
API where possible.

### QR display

Render QR modules with `react-native-svg`.

- Keep a static rounded-module treatment by default.
- Optionally animate one shared radius value.
- Avoid hundreds of React state updates from `requestAnimationFrame`.
- Test real QR scanning at multiple sizes and representative payloads.

Scannability is the hard requirement; exact visual reproduction is secondary.

### Regional world map

Move paths to `react-native-svg` and precompute country bounds rather than
calling Skia's `computeTightBounds()` at runtime.

Add a deterministic generator that:

1. Reads the source SVG/path data.
2. Computes each country's bounds.
3. Writes JSON metadata.
4. Fails verification when generated output is stale.

The map and individual glyphs then use explicit `viewBox` values.

## Phase 4: Migrate onboarding

Rebuild the onboarding canvas scene as normal layered components.

### Text

Replace Skia ParagraphBuilder with React Native `Text` and normal layout while
preserving typography, wrapping, alignment, localization, and opacity
transitions. Native text should improve accessibility semantics.

### Flexible orb

Use the same native orb primitive planned for the main scene. Layer:

1. Outer glow sprite
2. Main orb image or gradient
3. Edge treatment
4. Inner-light/shadow overlay
5. Embedded onboarding image

Animate wrapper position, scale, rotation, and opacity with Reanimated.

### Chains

Use `react-native-svg` paths inside animated wrappers. Animate whole chain-piece
transforms instead of rewriting path data per frame. Preserve current timing and
matrix behavior.

### Phone

Rebuild the phone from:

- Views for the body and frame
- SVG for vector details
- `expo-image` for embedded artwork
- A tiled noise PNG replacing Skia turbulence
- Reanimated opacity and transforms

The noise need not remain procedural. A slow crossfade or offset between two
tiles is sufficient.

## Phase 5: Build native orb primitives

This phase establishes the reusable rendering layer for `HostedMiniOrb` and the
main scene.

### NativeOrb

Compose each orb from a small fixed number of GPU-friendly layers:

1. Outer glow
2. Main orb body
3. Edge/rim
4. Inner-light/shadow treatment
5. Optional detail image
6. Gesture and accessibility overlay

Prefer pre-baked transparent PNGs for radial glow and inner shading. Animate
transforms and opacity rather than rasterizing gradients per frame.

Theme transitions may crossfade between adjacent theme sprites. There are only
four theme levels, keeping the asset count manageable.

### NativeConnectionLight

Reuse existing trajectory and timing logic. Render each light as:

- An absolutely positioned animated wrapper
- A small pre-baked radial glow image
- Scale and opacity animation
- An optional bridge/tail layer near contact

Position must be driven by existing shared motion buffers and UI-thread
worklets. There must be no per-frame React state update.

### Provisioning marker

Recreate the marker using an animated wrapper, glow sprite, and core dot/ring.
Reuse the current orbit and reduced-motion calculations.

## Phase 6: Generate and implement metaball bridges

This is the central experimental phase.

### Generate reference masks from Skia

Use the current renderer to create normalized white-on-transparent samples for:

- Equal-size orb pairs at several distances
- Unequal-size orb pairs
- Particle-to-orb contact
- Early contact
- Mid bridge
- Strong bridge
- Near-complete overlap

Post-process these into clean alpha masks with consistent bounds and anchor
metadata. They serve both as design references and candidate runtime assets.

### Runtime pairwise bridge

For each eligible orb pair:

1. Calculate center distance.
2. Normalize against the combined radii.
3. Suppress the bridge outside the contact band.
4. Place the bridge at the midpoint.
5. Rotate it along the center-to-center angle.
6. Scale its length and thickness.
7. Tint it from the participating orb colors.
8. Place it behind the orb bodies so endpoints are concealed.
9. Fade it as the orbs separate or fully overlap.

Start with one continuously scaled mask. If visual comparison shows that it is
insufficient, use two or three masks and crossfade between them. Avoid a large
runtime atlas unless the lab proves it necessary.

### Three-body overlap

Render pairwise bridges for `A-B`, `A-C`, and `B-C`, then:

- Cap aggregate opacity.
- Suppress the least significant bridge if the center becomes too bright.
- Keep orb bodies above all bridges.
- Accept that the result is not an exact three-body liquid surface.

### Particle absorption

Use a smaller tapered bridge/tail mask when a connection light approaches an
orb. Drive length from distance, rotation from angle, width from particle size,
and opacity from contact progress.

### Asset fallback

If runtime image tinting or stretched masks differ materially across platforms,
bake palette-specific masks for the four theme levels and crossfade those
assets. Keep geometry and animation unchanged.

## Phase 7: Pilot with HostedMiniOrb

Migrate `src/components/HostedMiniOrb.tsx` before the main scene. It exercises
orb shading, connection lights, metaball contact, active/connecting/idle modes,
and small-size rendering without the full geometry and interaction complexity
of `OrbScene`.

Acceptance criteria:

- Idle and active goldens are approved.
- Particle contact remains visually legible.
- Common sizes show no obvious seams.
- Web and native animation is smooth.
- The hosted screen has no frame regression.
- Reduced-motion behavior works.

Use lessons from this pilot to settle the final orb and bridge asset strategy.

## Phase 8: Migrate OrbScene behind a dual renderer

Temporarily split the scene into:

```text
src/components/orb-scene/
|-- OrbScene.tsx
|-- OrbScene.types.ts
|-- OrbScene.model.ts
|-- OrbSceneSkia.tsx
|-- OrbSceneNative.tsx
|-- NativeOrb.tsx
|-- NativeConnectionLight.tsx
|-- MetaballBridge.tsx
`-- visualScenarios.ts
```

During migration:

- Production defaults to Skia.
- The visual lab can choose either renderer.
- A development flag may select the native renderer in the real app.
- Both renderers share contracts, seeds, geometry, and motion plans.

Implement the native renderer in this order:

1. Static orb placement
2. Theme colors
3. Glow and shading
4. Connection-light motion
5. Orb mode transitions
6. Slot swapping
7. Pairwise bridges
8. Particle absorption
9. Provisioning markers
10. Highlight and gesture behavior
11. Reduced motion
12. Background-blur approximation

### Background blur

Do not add a platform-specific live blur dependency solely to duplicate Skia's
scene blur. Approximate `applyBlur` by crossfading toward softer/pre-blurred orb
assets, reducing detail opacity and contrast, and optionally adding a dim
overlay. This is predictable on web and acceptable under the agreed fidelity
target.

## Phase 9: Validation and rollout

### Visual acceptance

Every golden scenario must have:

- Skia baseline
- Native candidate
- Side-by-side output
- Difference heat map
- Recorded approval or scenario-specific tolerance

Review the mobile viewport first, followed by desktop web.

### Functional validation

Verify:

- Orb taps and long presses
- Hosted-orb selection
- Slot remapping
- Accessibility labels
- Disabled-press behavior
- Local and hosted mode differences
- Reduced-motion behavior
- App background/foreground transitions
- Modal open/close behavior
- Orientation and viewport changes

### Native validation

Reuse existing Maestro flows for:

- Local home
- Hosted home
- Hosted setup
- Dashboard
- Onboarding welcome
- Onboarding phone

Maestro validates state reachability and interaction. The web visual lab remains
the primary visual comparison system.

### Performance acceptance

The replacement should:

- Not increase frames over 20 or 33 ms.
- Improve or maintain worst-frame duration during swaps and multi-light motion.
- Avoid per-frame React renders.
- Avoid image decoding during active animation.
- Start web without CanvasKit initialization.
- Reduce the exported web payload.
- Reduce or maintain native application size.
- Remain responsive with three orbs and maximum connection lights.

When a richer bridge variant measurably harms performance, choose the simpler
variant.

## Phase 10: Remove Skia and CanvasKit

After all production consumers have migrated:

- Delete `OrbSceneSkia`.
- Remove every `@shopify/react-native-skia` import.
- Remove the package dependency.
- Remove `prepare-canvaskit-web` scripts and build steps.
- Delete CanvasKit preparation code and copied assets.
- Simplify the web entrypoint.
- Remove Skia Jest mocks.
- Delete obsolete canvas components.
- Rename `src/components/canvas` if remaining contents are no longer
  canvas-specific.
- Rebuild native projects and lockfiles.
- Run unit tests, formatting, TypeScript, web export, and native smoke tests.
- Verify a clean search for `Skia`, `CanvasKit`, and the package name.

Keep accepted scenarios and replacement-renderer baselines. Remove the legacy
Skia baselines only after they are no longer useful for regression analysis.

## Suggested delivery sequence

| PR | Scope | Risk |
| ---: | --- | --- |
| 1 | Deterministic scenarios, web lab, and Skia baselines | Low |
| 2 | Performance probes and baseline report | Low |
| 3 | `expo-linear-gradient` and simple gradient migrations | Low |
| 4 | Icons, QR display, and world map | Medium |
| 5 | Onboarding migration | Medium |
| 6 | Native orb primitives and generated assets | Medium |
| 7 | HostedMiniOrb pilot and bridge convergence | High |
| 8 | Native OrbScene static layout, themes, and gestures | High |
| 9 | Connection lights, swaps, bridges, and markers | High |
| 10 | Native/web validation and production renderer switch | High |
| 11 | Skia and CanvasKit removal | Medium |

Each PR must leave the application runnable and independently reviewable. Do
not mix high-risk renderer work with final dependency removal.

## Risks and mitigations

### Canvas and DOM output differ at the pixel level

Use perceptual comparison, scenario-specific tolerances, and human approval.
Treat heat maps as diagnostic tools rather than absolute truth.

### Image tinting differs across platforms

Validate a minimal tinted-mask prototype on web, iOS, and Android during the
HostedMiniOrb pilot. Fall back to palette-specific baked assets if necessary.

### View count erodes the expected performance gain

Keep each orb and light to a small fixed layer count. Prefer grouped image
layers and pre-baked detail over many small views. Measure maximum-light and
three-orb scenarios early.

### Dual-renderer extraction destabilizes production

Keep Skia as the production default until the native renderer is approved. Move
pure calculations incrementally and protect them with unit tests.

### Screenshot capture is flaky

Use fixed seeds and dimensions, explicit readiness markers, decoded-image waits,
font readiness, and frozen animation progress. Retain capture diagnostics on
failure.

### Web convergence hides native differences

Use web for the fast inner loop, then validate image tinting, transforms,
z-ordering, gestures, and frame behavior on both native platforms before each
renderer milestone is accepted.

## Definition of done

The migration is complete when:

- No production file imports Skia.
- CanvasKit is absent from web startup and build output.
- All agreed golden scenarios are perceptually approved.
- Web works at both canonical viewports.
- iOS and Android Maestro smoke/performance scenarios pass.
- Orb gestures and accessibility behavior are preserved.
- Simplified bridges keep metaball relationships visually legible.
- Three-body states do not show obvious seams or brightness blowout.
- Frame performance is equal to or better than the Skia baseline.
- Reduced-motion and E2E behavior remain deterministic.
- Tests, formatting, TypeScript, native builds, and web export pass.
- Temporary feature flags and the legacy renderer are removed.

## First deliverable

The first implementation PR should contain only:

- Deterministic visual-scenario types and fixtures
- The development-only web visual lab
- Explicit animation progress and random-seed control
- Playwright capture and comparison commands
- Current Skia goldens at the two canonical viewports
- Documentation for capturing and reviewing visual changes

That harness becomes the feedback loop for every rendering decision that
follows.
