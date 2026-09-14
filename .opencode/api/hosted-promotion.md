# Hosted promotion

Scope: local, device/browser-wide suppression of optional hosting promotions.
No backend, account, analytics, entitlement, purchase or tunnel mutations.
Depends on AsyncStorage, TanStack Query, the existing `useAppIsActive` native/web
lifecycle hook, and app-appearance paint tokens for the dismiss control.

## Placement policy

- Home: only the `setup` acquisition card without a recent hosted sign-in is
  promotional. Restore, renew, loading, provisioning, share and view/manage
  actions remain available regardless of dismissal.
- Hosted setup: the sign-in hero (introductory artwork and marketing copy) is
  optional. Suppression leaves the headline and all primary sign-in/setup/
  purchase controls. Plan selection and actionable status/empty states remain.
- Dashboard's hosting entry point and Account sign-in remain explicit paths to
  hosting. Dismissal never disables navigation or a purchase workflow.

## Public contract

- `HostedPromotionProvider` is mounted once in each app layout under QueryClient.
  `useHostedPromotion` supplies shared `visible` and immediate `dismiss` behavior.
  Pending or failed hydration hides promos (not the app), avoiding a promo flash.
- `HostedPromotionCloseButton` is an accessible, localized 44px dismissal target.
  It is a sibling, not a child, of the promotional navigation button.
- AsyncStorage key `ASYNCSTORAGE_HOSTED_PROMOTION_DISMISSED_AT_KEY` contains raw
  decimal epoch milliseconds at `hostedPromotionDismissedAt`, shared across
  placements and account changes. Query key `[QUERYKEY_HOSTED_PROMOTION]`
  (`["hostedPromotion"]`) caches decoded preference state.
- Only nonnegative safe-integer, finite timestamps no later than read time are
  accepted. Missing, malformed or future data means no prior dismissal. A read
  failure instead suppresses promos for the session to avoid ignoring a possibly
  saved dismissal. Stored values are never logged or deleted during fallback.
- Cooldown is exactly 60 × 24 hours from the latest dismissal; at the boundary
  promos may appear again. Dismissing again starts a new 60-day interval.
  Hydration cannot undo an in-session dismissal. Writes are ordered; failures
  retain the in-session suppression and emit sanitized local diagnostics with
  operation/cause kind only. Original causes remain in typed persistence errors.
- Expiry refreshes while mounted with bounded timers (no 60-day timeout overflow)
  and on app resume/browser visibility changes through `useAppIsActive`.
  Providers clean up timers and observers on unmount. No per-placement effects.

This owner is separate from appearance and hosted account state: the preference
is promotional UX policy, not a skin or a server-side entitlement. Existing
AsyncStorage/query conventions are reused without coupling the two systems.

Verification: `npx jest src/hosted-promotion --runInBand` exercises hydration,
ordering, restart, boundary/repeated dismissal, invalid data and safe failures.
`CONDUIT_WEB_URL=http://127.0.0.1:8094 node visual/verify-hosted-promotion.mjs`
drives actual Home/setup controls and browser visibility events with a fixed
clock, including retained navigation and a no-flash hydration observer. Native
resume wiring reuses `useAppIsActive`; the Jest Expo event-emitter stub is not
used as a substitute for real native lifecycle verification.
