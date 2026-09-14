# App appearance

Scope: persisted skin selection, renderer paint, and consuming app surfaces. No
changes to tunnel behavior, hosted state, geometry, gestures, or animation timing.

- `AppSkinId`: `current` (Classic Light, default) or `classic-dark` (Classic Dark);
  IDs are stable storage values. Classic Light retains the `SKIN_CURRENT_I18N` key.
- `APP_SKINS`: centralized typed surface, text, gradient and renderer paint roles.
  IDs derive from `AppSkinIdSchema`; each keyed definition owns its matching ID
  and localized `labelKey`. Settings and lab choices enumerate this registry.
- `AppAppearanceProvider`: mounted inside the existing QueryClientProvider; loads
  the non-secret preference through existing cross-platform storage. Missing or
  invalid data selects `current`. Read failures leave the default usable.
- `useAppAppearance`: selected tokens, consumed startup `hydrated` readiness,
  persistence state and selection action. Hydration reads local storage even
  when TanStack Query's online manager reports offline. Failed reads resolve
  readiness with Classic Light; a never-settling adapter remains pending.
  Selection updates all consumers immediately, serializes writes, and reports
  persistence failure without discarding the in-session selection.
- `AppStartupGate`: both root layouts mount the provider before this gate. It
  waits for fonts (success or error) and appearance hydration, then commits the
  app before invoking `onReady` (native splash removal). The existing two-second
  native startup deadline bounds both waits and is shared with web. Partial
  progress does not restart it; release is latched. A stalled read reveals
  Classic Light at the deadline and applies the saved skin if it eventually resolves.
- `useAppearanceStyles`: skin-aware shared styles for legacy UI consumers; static
  layout/font styles and the existing palette remain unchanged.
- Additional control paint roles: `dropdown` owns expanded settings surfaces;
  `segmentedControl` owns dashboard station/window and hosted chart-mode button
  surfaces; `subtleBorder` retains Classic Light's thin purple borders without
  leaking them into Classic Dark. Hosted setup primary/rewards gradients and
  selected-plan shadows are skin paint; account danger-confirmation panels have
  their own surface role. Destructive text/borders and sign-in brand badges keep
  their semantic red and brand colors. No action or dismissal behavior changes.
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
  for Classic Light. Optional `OrbTheme.innerShadowTL` and `rimColor` add the cold
  top-left shadow and rim without affecting existing callers.
  `orb.sceneProfile` distinguishes the original translucent `pastel` evolution
  tables from opaque `cold-rim` paint. It is the remaining structural renderer
  compatibility branch, not a skin-ID switch. Cold-rim tables are derived once
  from each registered skin's tokens. UI roles, hero pulse endpoints, mini orb
  cycle paint and onboarding colors are defined entirely in skin tokens.
  Local and hosted SVG body definition keys include skin identity so live skin
  switches remount native gradient definitions without resetting scene motion.
- Classic Light navigation uses the original `DefaultTheme` object unchanged; root
  stacks explicitly paint their skin background. Classic uses dark navigation
  with skin colors. `navigationDivider`, `switchActiveTrack` (native switch), and
  `aliasPlaceholder` are independent roles: Classic has a muted alias placeholder
  and a high-contrast active switch track instead of the deep action surface.
- `SkinPicker`: shared native/web settings control occupies one compact row with
  Appearance, the localized current skin label, and a downward chevron. Pressing
  it measures the row and opens an anchored dropdown in a transparent native/RN
  Web `Modal`, never expanding settings layout. The menu fits the viewport,
  flips above the row when needed, and closes on selection, outside tap, native
  back/accessibility escape, web Escape, or window resize. The web modal traps
  focus and restores it to the trigger; the selected option receives initial
  focus. Native options expose radio checked state and accessibility focus.
  Save failures leave only an accessible warning indicator in the row; reopening
  reveals the full localized explanation. Selecting the checked option retries
  saving and closes the menu. No additional settings screen or sheet is involved.
  Appearance uses the `paint-palette` SVG in the shared `Icon` registry; its
  `chevron-down` Icon uses the same size (16), text tint and expanded rotation as
  Local Station.
- `/orb-lab?skin=classic-dark` previews
  deterministic renderer paint without changing the stored preference; omitted or
  invalid lab skin selects `current`.
  `SkinRadioOption` takes an `onSelect(AppSkinId)` callback and optional
  `focusOnMount`; it uses native accessibility radio state on mobile and a real
  HTML radio on web (Space and arrow keys, focus, and checked state). The picker
  owns applying the selection and closing the overlay.
  `scenario=appearance-controls` renders real expanded dropdown, hosted action,
  and chart-mode controls without backend credentials for paint inspection.

Dependencies: AsyncStorage (native app storage; localStorage on web), shared
`common/colorUtils` for hex-to-RGB paint, TanStack Query cache, i18next, existing SVG/native/
Reanimated renderer. There were no pre-existing API contract documents.
