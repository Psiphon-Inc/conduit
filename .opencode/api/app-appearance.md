# App appearance

Scope: persisted skin selection, renderer paint, and consuming app surfaces. No
changes to tunnel behavior, hosted state, geometry, gestures, or animation timing.

- `AppSkinId`: `current` (default) or `classic-dark`; IDs are stable storage values.
- `APP_SKINS`: centralized typed surface, text, gradient and renderer paint roles.
  IDs derive from `AppSkinIdSchema`; each keyed definition owns its matching ID
  and localized `labelKey`. Settings and lab choices enumerate this registry.
- `AppAppearanceProvider`: mounted inside the existing QueryClientProvider; loads
  the non-secret preference through existing cross-platform storage. Missing or
  invalid data selects `current`. Read failures leave the default usable.
- `useAppAppearance`: selected tokens, consumed startup `hydrated` readiness,
  persistence state and selection action. Hydration reads local storage even
  when TanStack Query's online manager reports offline. Failed reads resolve
  readiness with Current; a never-settling adapter remains pending.
  Selection updates all consumers immediately, serializes writes, and reports
  persistence failure without discarding the in-session selection.
- `AppStartupGate`: both root layouts mount the provider before this gate. It
  waits for fonts (success or error) and appearance hydration, then commits the
  app before invoking `onReady` (native splash removal). The existing two-second
  native startup deadline bounds both waits and is shared with web. Partial
  progress does not restart it; release is latched. A stalled read reveals
  Current at the deadline and applies the saved skin if it eventually resolves.
- `useAppearanceStyles`: skin-aware shared styles for legacy UI consumers; static
  layout/font styles and the existing palette remain unchanged.
- `loadAppSkinPreference` / `saveAppSkinPreference`: default to AsyncStorage,
  following the existing sound/onboarding UX-preference convention. Both accept
  the narrow `SkinPreferenceStorage` capability (`getItem`/`setItem`), also
  accepted by the provider at composition. Reads return `loaded` with `skinId`,
  or `unavailable` with `skinId: current` and an `AppAppearanceError`. Writes
  return `saved` or `unavailable` with the error. Errors retain their original
  cause. `reportAppearanceFailure` logs only operation and allowlisted cause
  kind through existing console-only client-event diagnostics, never raw
  storage/OS messages, stacks or values. System chrome uses the same diagnostics.
  Storage is raw stable ID text, not JSON, at `ASYNCSTORAGE_APP_SKIN_KEY`
  (`appSkin`). Query key is `[QUERYKEY_APP_SKIN]` (`["appSkin"]`).
  No migration from the unreleased implementation's native SecureStore key is
  included; web retains the same localStorage key through AsyncStorage.
- Orb scene evolution levels still express scene state, not skin. Renderer theme
  selection combines the skin with the existing 0–3 evolution theme level.
  `getOrbSceneTheme(skinId, level)` preserves the original `SCENE_THEMES` objects
  for Current. Optional `OrbTheme.innerShadowTL` and `rimColor` add the cold
  top-left shadow and rim without affecting existing callers.
  `orb.sceneProfile` distinguishes the original translucent `pastel` evolution
  tables from opaque `cold-rim` paint. It is the remaining structural renderer
  compatibility branch, not a skin-ID switch. Cold-rim tables are derived once
  from each registered skin's tokens. UI roles, hero pulse endpoints, mini orb
  cycle paint and onboarding colors are defined entirely in skin tokens.
  Local and hosted SVG body definition keys include skin identity so live skin
  switches remount native gradient definitions without resetting scene motion.
- Current navigation uses the original `DefaultTheme` object unchanged; root
  stacks explicitly paint their skin background. Classic uses dark navigation
  with skin colors. `navigationDivider`, `switchActiveTrack` (native switch), and
  `aliasPlaceholder` are independent roles: Classic has a muted alias placeholder
  and a high-contrast active switch track instead of the deep action surface.
- Settings exposes localized radio options. `/orb-lab?skin=classic-dark` previews
  deterministic renderer paint without changing the stored preference; omitted or
  invalid lab skin selects `current`.
  `SkinRadioOption` uses native accessibility radio state on mobile and a real
  HTML radio on web (Space and arrow keys, focus, and checked state).
  Clicking an already-checked radio retries a failed write, as the warning directs.

Dependencies: AsyncStorage (native app storage; localStorage on web), shared
`common/colorUtils` for hex-to-RGB paint, TanStack Query cache, i18next, existing SVG/native/
Reanimated renderer. There were no pre-existing API contract documents.
