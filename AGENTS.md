# Agent Guidance

## Async State Management

- Prefer React Query for all async state management, not only network calls.
- If state is sourced from an async function (SDK call, storage read/write, bridge/module call, timers that refresh data), model it with `useQuery` or `useMutation`.
- Avoid `useEffect` + `useState` fetch orchestration when React Query can own loading/error/stale/retry behavior.

## Query Keys

- Use stable, centralized query keys from `src/constants.ts` (or a dedicated key factory if introduced).
- Do not create ad-hoc string keys inline when a shared key exists.
- Include identity and scope inputs in keys (account id, selected target, window, etc.).

## Polling And Refresh

- Prefer React Query polling (`refetchInterval`) over manual `setInterval` loops.
- Gate polling with app visibility/focus where appropriate.
- Handle session/token expiry by invalidating or refreshing related queries via query keys.

## Refactor Policy

- When touching existing async flows, opportunistically migrate to React Query patterns.
- Keep UI state (`expanded`, `modalOpen`, etc.) in component state; keep async resource state in React Query.
