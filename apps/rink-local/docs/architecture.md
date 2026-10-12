# Vertical-slice architecture and correctness notes

`GameStore` accepts a command, checks its idempotency key, validates against replayed state, then atomically inserts the immutable event and sync-outbox row into SQLite. Only after commit does it regenerate the non-authoritative `.log` and `.jsonl` mirrors. If a mirror write fails, `TextMirrorHealthy` becomes false and the official journal is still intact; startup and explicit `RepairTextMirror()` regenerate projections. Text projection output contains only IDs, not minor-player names.

Event envelopes contain UTC wall time **and** the operator-supplied game clock. Wall time is for audit, never for clock authority. An attribution correction preserves the original `GOAL_RECORDED` payload and produces a new `GOAL_ATTRIBUTION_CORRECTED` event. `GameProjector` computes the current goal view without double-counting goals.

Production hardening must handle multiple simultaneous operator processes, intentional game deletion/voiding, roster/authorization constraints, rule-specific penalty expiration, time synchronization, log file tampering detection, long-running export, retention, youth privacy, and official certification. A text mirror that can be regenerated from the same SQLite database is **not** a physical independent backup. If log file writes fail, the UI must show a persistent warning.
