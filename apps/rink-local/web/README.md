# Icebreaker v0.5 browser touchscreen prototype

Open `index.html` in a modern browser. No server or build step is required. This is a **functional UI demo** with Pasadena Maple Leafs versus Santa Clarita Flyers, not a production scorekeeper.

- One-touch jersey numbers, scorer -> assist 1 -> assist 2, TBD/None, confirm/edit/cancel.
- One-touch common penalties, duration presets, confirm/edit/cancel.
- Every meaningful UI action goes into an operator-action stream (including canceled drafts and corrections); official actions are marked separately.
- Export both human-readable `.log` and structured `.jsonl`.
- Running clock demo, period control, shots, configurable demo mercy threshold, attribution-only correction of the last goal (without changing score).
- Local browser storage is a convenience only; it is **not** crash-proof, authoritative, or tamper-resistant.
- There is no PA synthesis, physical scoreboard connection, server sync, secure authentication, or roster eligibility validation.

The production C# `OperatorActionLog` in `src/Icebreaker.Core/Audit` is a separate hash-chained append-only log for meaningful operator actions. Its entries must be linked to the official event ID upon commit. It does not replace the SQLite event journal.
