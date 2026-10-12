# Icebreaker v0.9 — Executable local backend vertical slice

## Run

Requirements: Node.js 22.13+ (built-in `node:sqlite`; currently experimental). No npm dependencies.

```powershell
cd icebreaker_engine_v0
node server/rink-server.js
```

Open `http://127.0.0.1:8090/operator.html` for the scorekeeper and `http://127.0.0.1:8090/live.html` in a second browser for the parent tracker. They use one SQLite game journal and Server-Sent Events. Changes appear without refresh.

Run tests: `node --test tests/browser/*.test.js`.

## Data and API

- `data/demo.db`: SQLite WAL with `game_events` and `sync_outbox` inserted in one transaction. Schema and event payloads follow the C# `Icebreaker.Core` schema for the supported event types.
- `data/demo.db.events.log`: rebuildable readable official-event mirror. It is not authoritative.
- `data/demo.db.actions.jsonl`: separate private operator-action audit, including draft selections, cancellations, confirmations, rejected commands, backend starts, and mirror failures.
- `GET /api/games/demo/snapshot`: full-score, spectator-safe public snapshot.
- `GET /api/games/demo/events`: SSE full snapshots, with revision IDs and reconnect support.
- `GET /api/games/demo/arena-scoreboard`: public arena display projection (mercy cap only here).
- `POST /api/operator/command`: development-only authenticated command, with required `Idempotency-Key` header.
- `POST /api/operator/action`: development-only low-level action log.
- `GET /api/health`: revision and mirror health.

## Explicit safety / production gaps

This is a *local development vertical slice*, not an internet-ready production backend. Operator key is intentionally a known development default and appears in the local operator UI; server binds loopback. Before remote use: replace with session-based auth and roles, CSRF protection, secure origin controls, TLS, deployment monitoring, backup/retention, privacy and consent policy, rate limiting, full schema migrations, game lifecycle and multi-game routing, hardware clock interface, and formal API contracts. `node:sqlite` is experimental on Node 22. The authoritative target remains C#/.NET, but the SDK is unavailable in this environment and has not been compiled here.

### Clock semantics

The live clock uses monotonic elapsed time in the running process and pushes snapshots each second. The last committed clock value is retained in the SQLite journal. A backend restart that finds a running clock commits a system-recovery STOP, leaving the game paused; elapsed downtime is never inferred. The running-clock mercy whistle policy is not yet wired into this Node backend.

### Audit semantics

The SQLite journal is the source of truth for accepted official actions. The low-level action log is append-only JSONL and *not* an official event source. Operator audit writes are currently best-effort in the browser and must become a guaranteed local spool before a real rink deployment. The mirror can be regenerated from the journal. This slice does not yet include the earlier C# audit hash chain in the Node audit path.

### Browser verification

Automated Node tests verify HTTP, SSE initial delivery, persistence, idempotency, correction, full-score policy, and mirror/audit isolation. They do not constitute full end-to-end UI testing.
