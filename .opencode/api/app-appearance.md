# App appearance

Scope: persisted skin selection, renderer paint, and consuming app surfaces. No
changes to tunnel behavior, hosted state, geometry, gestures, or animation timing.

- `AppSkinId`: `current` (default) or `classic-dark`; IDs are stable storage values.
- `APP_SKINS`: centralized typed surface, text, gradient and renderer accent tokens.
- `AppAppearanceProvider`: mounted inside the existing QueryClientProvider; loads
  the non-secret preference through existing cross-platform storage. Missing or
  invalid data selects `current`. Read failures leave the default usable.
- `useAppAppearance`: selected tokens, loading/saving state and selection action.
  Selection updates all consumers immediately, serializes writes, and reports
  persistence failure without discarding the in-session selection.
- `useAppearanceStyles`: skin-aware shared styles for legacy UI consumers; static
  layout/font styles and the existing palette remain unchanged.
- `loadAppSkinPreference` / `saveAppSkinPreference`: default to the existing
  platform storage adapter; accept the narrow `SkinPreferenceStorage` capability
  also accepted by the provider at composition. Writes return `saved` or
  `unavailable`; failed reads return `current`. Storage is raw stable ID text,
  not JSON, at `SECURESTORE_APP_SKIN_KEY` (`appSkin`). Query key is `["appSkin"]`.
- Orb scene evolution levels still express scene state, not skin. Renderer theme
  selection combines the skin with the existing 0–3 evolution theme level.
  `getOrbSceneTheme(skinId, level)` preserves the original `SCENE_THEMES` objects
  for Current. Optional `OrbTheme.innerShadowTL` and `rimColor` add the cold
  top-left shadow and rim without affecting existing callers.
- Settings exposes localized radio options. `/orb-lab?skin=classic-dark` previews
  deterministic renderer paint without changing the stored preference; omitted or
  invalid lab skin selects `current`.
  `SkinRadioOption` uses native accessibility radio state on mobile and a real
  HTML radio on web (Space and arrow keys, focus, and checked state).

Dependencies: `common/secureStorage` (SecureStore native; localStorage for this
non-secret preference on web), TanStack Query cache, i18next, existing SVG/native/
Reanimated renderer. There were no pre-existing API contract documents.
