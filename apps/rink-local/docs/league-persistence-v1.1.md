# Icebreaker League Persistence v1.1

Status: **development vertical slice — NOT production**.

## Changes
- Added SQLite-backed `seasons`, `divisions`, `teams`, `players`, `roster_memberships`, `games`, `goal_attributions`, `league_audit`.
- The existing `/api/league/v1/overview` now reads SQLite, derives standings/player statistics from *certified* games, and marks the seeded examples explicitly fictional.
- `POST /api/league/v1/games` schedules a game using the existing development operator key.
- `POST /api/league/v1/games/:id/certify` requires `homeScore`, `awayScore`, `expectedVersion`, and complete `goals` array (`side`, `scorerId`, optional `assist1Id`/`assist2Id`). This verifies score/goal totals, players' roster memberships, unique attributions and optimistic concurrency, and atomically commits the result and audit entry. An already-certified game cannot be silently overwritten.
- Unauthenticated writes are rejected, and the admin audit is inaccessible to spectators.

## Requirements (draft)
- LEAGUE-DB-001: Persist seasons, divisions, team identities, roster membership, player IDs, scheduled matches, final results and goals.
- LEAGUE-DB-002: Derive standings and player totals solely from certified results with versioned league rules.
- LEAGUE-DB-003: Certification must reject unreconciled score/goal totals and improper player attribution atomically.
- LEAGUE-DB-004: Preserve roster identities across changes to jersey numbers and seasons.
- LEAGUE-DB-005: Certification and schedule changes must be auditable and protected by roles/permissions.
- LEAGUE-DB-006: Live tracker continues to expose the complete uncapped official score, independent of the arena mercy display.

## Browser and server
Run `START_ICEBREAKER_WINDOWS.cmd` on Windows with Node 22.13+; open `http://127.0.0.1:8090/league.html`. Standalone preview: `Icebreaker_League_Website_Demo.html` (static, fictional data).

## Verification
Run: `node --test tests/browser/*.test.js`. 56 tests passed in this build. Server smoke HTTP test included. The SDK for the earlier C# code remains unavailable and the C# code was not compiled.

## Remaining before production
- Current match live events are NOT yet materialized into finalized league box scores. An authenticated scorekeeper/game-official certification workflow must translate the authoritative rink journal into final league goals, roster references and approved corrections before publishing.
- Existing operator credential is development-only and must be replaced with real identity, roles, TLS, secure session handling, and per-division access policy.
- Seeded fixtures are fictional and loaded on a new DB. Production migration tooling, arbitrary seasons/divisions, cross-season roster history, score corrections, configurable standings points/tiebreakers, youth privacy and attendance/eligibility need further work.
- All goal rows currently require resolved scorer on certification. Future league rules may permit an explicitly certified unknown scorer, but that requires an authorized policy, not silent default.
- Do not expose the database directly to the public internet.
