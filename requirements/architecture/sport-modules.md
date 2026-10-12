# ARCH — Sport-neutral extension architecture (v2.2 development increment)

- **ARCH-001 (P0):** The platform SHALL identify every game by a stable `sportId` and ruleset version before accepted scoring commands are processed.
- **ARCH-002 (P0):** The sport-independent infrastructure SHALL own event IDs, durable sequencing, identity, synchronization, audit and certification, never sport-specific penalty logic.
- **ARCH-003 (P0):** Sport modules SHALL expose a versioned contract with capabilities, event validation, deterministic projection and presentation metadata.
- **ARCH-004 (P0):** A mismatched sport or unsupported event SHALL be rejected without altering the journal.
- **ARCH-005 (P0):** Replay SHALL reject gaps in committed event sequence and SHALL deterministically reconstruct published statistics.
- **ARCH-006 (P1):** Adding a new sport SHALL not require altering the generic ingestion/outbox implementation, except a documented protocol migration.
- **ARCH-007 (P1):** UI elements for sport-specific concepts (e.g., penalty timers versus yellow cards) SHALL be driven by declared capabilities, not hard-coded globally.
- **ARCH-008 (P0):** A sport module and its ruleset revision SHALL be immutable for a live game absent an explicit audited administrative transition.

## Status

A standalone sport-module registry and deterministic replay contract are implemented with hockey and a **non-production soccer sample**. The existing hockey `Authority` is NOT yet switched over to this contract; ingestion event envelopes and UI are NOT yet generalized. Those steps require a schema migration and compatibility tests on existing game journals. This increment does not claim soccer scoring readiness.

## Traceability

`tests/architecture/sport-modules.test.js` covers ARCH-003, ARCH-004 and ARCH-005. Integration coverage for ARCH-001/002/006/007/008 is pending.