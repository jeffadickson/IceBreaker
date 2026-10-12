# Icebreaker Live Game Tracker — v0.6

## Selected requirements methodology
- **Gherkin** for observable acceptance criteria (`parent-tracker.feature`).
- **CSV traceability register** mapping each requirement to test artifact, priority and current verification status.
- **Node built-in test runner** (`node --test tests/browser/tracker-model.test.js`) for fast deterministic read-model unit tests; .NET xUnit remains the backend authority test framework.
- Use stable identifiers `PARENT-001` to `PARENT-012`. Add scenarios for replay, multi-device ordering, youth privacy, and accessibility before production sign-off.

## What this prototype does
`web/parent.html` is a polished mobile-first read-only timeline for Pasadena Maple Leafs versus Santa Clarita Flyers. `web/tracker-model.js` projects goal, penalty, period and correction events and caps the public score under mercy policy. It ignores operator draft/audit events in its rendered timeline; the raw same-origin localStorage source is not private and must not be used for production spectator access. The existing `web/index.html` links to the parent view. Same-origin browser tabs exchange state through localStorage and optional BroadcastChannel; no remote network feed is implemented.

## Production architecture — NOT implemented
1. Official SQLite event journal is the sole scoring authority.
2. Server-side spectator projector consumes committed official events only and builds a **public-safe DTO** (no `official` score field, operator IDs, private minor data, audit trails or privileged event payloads).
3. Publish snapshots and ordered event updates via ASP.NET Core SignalR and GET `/api/public/games/{id}/tracker?afterRevision=N` (route proposal, not yet implemented).
4. Assign monotonic per-game revisions; reconnect fetches gaps and applies idempotently. Expose `asOfUtc`, `lastRevision`, connectivity status, and stale thresholds; use server timestamp, not only socket connection, to indicate freshness.
5. Authorization: public-safe game page only if league permits public access; otherwise short-lived signed spectator link. Rate limit, log access appropriately, and do not publish child full names by default.
6. Corrections reference original event IDs and update visible goal attribution without changing goal count. Rescinded goals remain marked as such.
7. Official score remains private from spectator projection under mercy-rule display cap; avoid embedding it in HTML, JSON, JS state or websocket payload.
8. Test privacy at serialized API boundary, not just at the UI filter. Include contract, integration, security, accessibility and reconnect tests before production.

## Limitations and defects to resolve
- This is a local browser demo, **not a remotely accessible real-time service**.
- Browser localStorage is not a durable event journal and is not authorized for production scoring.
- The existing scorekeeper demo persists official events and UI state in separate steps; production must publish committed snapshots atomically from the C# journal.
- Local demo sample has illustrative roster/score events, not a validated historical game.
- Score clock advances in the scorekeeper tab; the parent receives periodic state updates but cannot be authoritative.
- Current UI labels LOCAL LIVE DEMO based on local storage presence; it must not be treated as server connectivity.
