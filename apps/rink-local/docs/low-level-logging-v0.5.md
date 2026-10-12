# v0.5 — Low-level operator audit requirement

## Scope and guarantees

**Every meaningful game-related action** must be logged, including actions that never become official events: entering a goal/penalty draft, choosing a player, selecting TBD/None, changing a penalty type/duration, editing the confirmation dialog, canceling a draft, confirming a draft, requesting a clock stop, manual horn/PA actions, changing settings, corrections, failed validation, rejected/duplicate commands, exports, and recovery operations.

The `OperatorActionLog` stores append-only JSONL records with:

- Consecutive sequence number and UTC timestamp
- Session ID and operator ID
- Action type, game ID, optional draft ID and official event ID
- JSON details (minimized: do not include passwords, authentication tokens, or unnecessary personal information)
- Previous record's SHA-256 hash and this record's SHA-256 hash

Writes flush to disk before returning; a broken hash chain is detected on reopening. The log is separate from the official SQLite journal and the human-readable projection. Hash chaining detects accidental corruption and unsophisticated modification, **not a malicious administrator who can rewrite all entries**. A remote signed checkpoint would be needed for stronger tamper evidence.

`GameSession` now creates `operator-actions.jsonl`, logs command requests and accepted/duplicate/rejected outcomes for goals, attribution corrections, penalties, clock updates, stop requests, and PA queue controls, as well as mercy transitions and recovery actions. UI clients call `RecordOperatorAction` for all intermediate interactions. The browser prototype logs such actions locally and exports them, but is not connected to the C# writer.

## Important failure semantics

- A failed pre-command audit write prevents execution of that command.
- An official SQLite commit can succeed even if a subsequent audit outcome write fails. In that case the caller must reconcile by idempotency key against the official journal; it must **not** blindly retry with a new key.
- The two logs are not atomically committed together. A future `operator_action_outbox` in the same SQLite transaction will eliminate the post-commit gap, then stream records into the separate text log with verified checkpoints.
- The file log has a single writer and is not an independent backup against local disk failure.
- UI action logging must not emit one record per screen redraw, pointer movement or high-frequency clock tick. Log start/stop/set and significant clock transitions; monotonic elapsed time is derived.

## Follow-up work

1. Atomic command audit/outbox transaction with official journal.
2. A robust single-writer process lease and explicit degraded-logging operator warning.
3. Hash-chain verification and cross-check against official journal IDs on startup.
4. Retention, archive rotation, backup, and privacy-safe exports.
5. Avalonia native touchscreen client using the same UI interaction contracts as this browser prototype.
