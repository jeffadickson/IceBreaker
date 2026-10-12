# Operator readiness and roster selection — v1.8

Status: Development implementation; requires rink validation and production credentials.

| ID | Priority | Requirement | Verification |
|---|---|---|---|
| SCORE-READY-001 | P0 | The rink operator UI shall display pending and delivered outbox-event counts from the authoritative SQLite outbox, not inferred connection state. | `rink-backend.test.js` readiness status |
| SCORE-READY-002 | P0 | The operator status endpoint shall require operator authentication and shall not be exposed in public spectator projections. | `rink-backend.test.js` unauthorized status |
| SCORE-READY-003 | P0 | In a fixture-bound rink session, the scorer/assist/penalty number picker shall derive choices from the **confirmed per-game lineups**; TBD remains available. | `rink-backend.test.js` page contract; existing server game-roster policy tests |
| SCORE-READY-004 | P0 | A bound game with unconfirmed lineups shall prominently display that lineup confirmation is required. The backend must continue to reject player events that fail roster policy. | Manual browser test; existing roster-policy tests |
| SCORE-READY-005 | P1 | The operator shall see a warning if the human-readable event log mirror is unhealthy. | `rink-backend.test.js` status; manual UX check |
| SCORE-READY-006 | P1 | Operator readiness shall refresh without resetting any in-progress entry draft or official event state. | Manual browser test |

## Limitations

The queued count indicates **not yet acknowledged**, not a measured network outage. A station may have no uploader configured. This UI must never label an unconfigured outbox as 'synced'. The current prototype still uses a development-only operator key; don't expose it publicly. Exclusive game writer assignment and controlled failover are separate server-side controls.