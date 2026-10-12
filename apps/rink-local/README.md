# Icebreaker — Hockey event engine vertical slice (v0.4)

A standalone **C#/.NET 8** source package demonstrating the first release-blocking Icebreaker features:

- SQLite authoritative append-only journal and transactional sync outbox.
- Stable event IDs and idempotency keys; one writer per `GameStore` instance.
- Goal scorer/assist attribution as `Player`, `Tbd`, or `None` (scorer cannot be `None`).
- Immutable goal corrections referencing original goal ID; scoring does not increment twice.
- Penalty-assessed and explicit clock action events.
- Crash-repairable human-readable `.log` and machine-readable `.jsonl` projections.
- xUnit tests covering replay, recovery, duplicate commands, attribution validation, and penalty/clock events.

## Automated PA announcer (v0.2 addition)

A pure deterministic `AnnouncementPlanner` converts committed game events into scripts for goals, penalties, and corrections; also supports final-minute and period-end clock cues. Number-only youth announcements by default, optional names, TBD-safe phrasing, and stable IDs for future durable deduplication. `IAnnouncementSpeechProvider` and `IAnnouncementAudioOutput` define adapters for offline TTS and optional AI TTS. **A durable outbox was added in v0.4; no audio engine or UI is implemented yet.** See `docs/announcer-design.md`.

## Mercy-rule policy (v0.3 addition)

A pure `MercyRules` evaluator supports configurable goal-differential triggers, earliest period, latched/dynamic activation, running-clock stop decisions and separate **public displayed score** projections. The official score is never modified. Eight new xUnit tests cover the policy. **Integrated with session-level clock policy, SQLite mercy transitions and public score projection in v0.4; not connected to physical scoreboard hardware**; see `docs/mercy-rules-design.md`.

## Integrated rink session (v0.4 addition)

`GameSession` now wires journaled goals, mercy activation, the public scoreboard
projection, clock-stop policy, monotonic clock samples, and a durable PA outbox.
Recovered PA items require manual review and clock recovery is paused. Saved mercy
configuration is pinned against silent changes. See `docs/integration-v0.4.md`.

## Run on Windows

Install the .NET 8 SDK, then from this directory:

```powershell
dotnet restore .\tests\Icebreaker.Core.Tests\Icebreaker.Core.Tests.csproj
dotnet test .\tests\Icebreaker.Core.Tests\Icebreaker.Core.Tests.csproj -c Release
```

No reference-repository code was copied. This is original C# implementation based on Icebreaker's agreed requirements.

## Current engineering limits — NOT production ready

- **No .NET SDK in the authoring environment:** source was reviewed statically; tests have **not** been executed. Run `dotnet test` before relying on any behavior.
- Per-instance locking is not a cross-process lease. Multiple processes writing to one database require fencing/lease protocol and conflict handling.
- Text projections currently rewrite all events per accepted action (O(N²) total). Replace with incremental, checkpointed streaming projection and sequence reconciliation before production.
- The text mirror is on the same machine by default; it is not an independent disk-failure backup.
- Monotonic local countdown is implemented, but no complete penalty-clock rules, UI, authentication, roster/eligibility validation, event signatures, sync transport, or game certification workflow yet.
- Outbox is durable but has no delivery/acknowledgment worker yet.
- `GameProjector` uses replay rather than snapshots; later introduce snapshot checkpoints.
- Clock actions accept operator-supplied seconds; monotonic time, drift, and pause/resume semantics remain to be implemented.
- The provided SQLite DB is intended to contain one game; opening the same DB with multiple different game IDs is not supported by this vertical slice.

## Proposed next milestone

Add clock engine with injected `TimeProvider`, formal game authority lease, roster-aware validation, a first Avalonia operator panel, and a read-only event history API. Then integrate with the broader platform.

## v0.5 operator-action logging and scorekeeper demo

- `web/index.html` is a **runnable, responsive browser touchscreen demo**, including the requested Pasadena Maple Leafs / Santa Clarita Flyers matchup, fast goal/assist selection, common penalty buttons, review/edit/confirm, event history, and JSONL/text export.
- `src/Icebreaker.Core/Audit/OperatorActionLog.cs` is a durable hash-chained append-only **low-level operator action log**. It captures meaningful actions such as opening/changing/canceling drafts, confirming, failed/rejected commands, corrections, clock actions, settings changes and export requests when the caller invokes it. Each record is flushed to disk. Reopening validates the chain; tampering raises an exception.
- `OperatorActionLogTests.cs` covers persistence, chain integrity, and input validation.
- **Important:** The browser demo is not connected to the C# authoritative engine. `GameSession` does not yet automatically invoke `OperatorActionLog`; the production UI adapter must do so for every command and user action. The existing SQLite official journal remains the sole official authority.
- Logging should cover **all meaningful game actions**, not high-frequency pointer movements, rendered frames or 60 Hz clock ticks. Automatic state transitions and clock start/stop/set are logged; elapsed time is reconstructed from monotonic clock anchors.

## v0.6 Parent Game Tracker
Open `web/parent.html` for the mobile spectator view, or use the link from `web/index.html`. For same-origin cross-tab updates, run `python -m http.server 8080` from the `web` directory and open `http://localhost:8080/index.html` and `http://localhost:8080/parent.html`. For unit tests run `node --test tests/browser/tracker-model.test.js` from the project root. Requirements: `docs/parent-tracker.feature`; traceability: `docs/parent-tracker-traceability.csv`. Demo-only, not remote production service.


## v0.7 Live spectator gateway + requirements management

- `web/live.html`: polished responsive spectator tracker with live score, filters, correction handling and an interactive demo panel. `Icebreaker_Live_Browser_Demo.html` is a **single-file standalone version** for direct browser opening.
- `server/live-server.js`: Node.js 22 built-in HTTP/SSE development server (loopback only by default), a public-safe snapshot projection, replayable append-only demo event journal, and a guarded **development-only** command endpoint.
- `requirements/icebreaker-live.sdoc`: initial StrictDoc requirements with IDs and `requirements/traceability.csv` linking implementations and tests.
- `node --test tests/browser/*.test.js`: 22 automated tests, including HTTP, authorization rejection, SSE snapshot, event correction, public projection, and traceability lint.

Run locally from project root:

```powershell
node server/live-server.js
```

Open `http://127.0.0.1:8080/live.html` in multiple browser tabs. To open directly without a server, use the standalone `Icebreaker_Live_Browser_Demo.html`.

**Not production-ready:** The Node server is a deliberately isolated development gateway, not the .NET authoritative rink backend. It has no real identity/guardian access control, TLS, multi-process consistency, durable operator-action audit for demo commands, or cloud deployment. Do not expose it to the internet. Its development operator key is embedded in the demo page, so it is not a security boundary. Production will require ASP.NET Core SignalR, authenticated command channel, and a public DTO projection from the authoritative journal. The published play-by-play may allow spectators to infer the uncapped goal total even if the displayed score is capped; the league must choose a disclosure policy.

## v0.8: Full-score parent tracker + .NET read-only gateway

**User-approved policy:** parent Live tracker always shows full official score and all approved goals, regardless of mercy rules. Only the arena scoreboard uses a mercy display cap.

- `web/live.html` and standalone `Icebreaker_Live_v0_8_Official_Score_Demo.html` show a populated Pasadena Maple Leafs / Santa Clarita Flyers demo, with a one-tap 8-goal lead demonstration.
- `server/live-server.js` has distinct `/api/games/demo/snapshot` (full official spectator score) and `/api/games/demo/arena-scoreboard` (mercy-capped arena score) projections.
- `src/Icebreaker.SpectatorGateway` is a **new read-only ASP.NET Core + SignalR/SSE scaffold** that reads the SQLite journal. It has no scoring commands, and its .NET code has not been compiled here. See `docs/live-gateway-v0.8.md`.
- Run `node --test tests/browser/*.test.js` for the JavaScript suite.

## v0.9: Runnable SQLite-backed rink server and browser scorekeeper

See `docs/backend-v0.9.md`. Run `node server/rink-server.js`, then open `http://127.0.0.1:8090/operator.html` and `http://127.0.0.1:8090/live.html` in separate windows. The operator writes to the SQLite game journal and the parent tracker receives spectator-safe updates via SSE. This is a local development backend; do not expose the operator server publicly.


## v1.0 League Center prototype

Open `/league.html` after starting `server/rink-server.js` (or run START_ICEBREAKER_WINDOWS.cmd). League overview, schedule filters, standings, player search and sorting are served from `/api/league/v1/overview`. **ALL LEAGUE FIXTURES ARE FICTIONAL DEMONSTRATION DATA** and are not persisted league results. Only completed sample fixtures count in standings and player totals; one ongoing example game is projected from the current demo game score without affecting season aggregates. `/league.html` does not provide official admin/roster/scheduling entry or player identity permissions. StrictDoc additions LEAGUE-001 to LEAGUE-008 and executable Node tests are in the package.

## v1.0 League website proof of concept

- `web/league.html` served at `http://127.0.0.1:8090/league.html` shows a league homepage, filterable schedule, standings, scoring leaders, player statistics, team profiles and game detail panels.
- `server/league-data.js` provides a **fictional, labelled** four-team fixture dataset and computes standings and statistics exclusively from finalized, demo-certified fixtures. The live Maple Leafs/Flyers game receives its live score from the local SQLite authority, but is **never counted in certified standings or player statistics**.
- `requirements/icebreaker-league.sdoc` adds 12 draft traceable league requirements.
- `Icebreaker_League_Website_Demo.html` is the independently opened standalone website using fictional embedded fixtures.
- `node --test tests/browser/*.test.js` executes the Node backend and API tests. Native .NET code is not yet compiled; future work includes authenticated league administration, persisted certified league data, event-derived stats, API pagination, division separation, privacy/publication approvals, and a production hosting architecture.

## v1.1 persistent league backend
The league overview now comes from SQLite rather than hard-coded calculations. New tables for seasons, divisions, teams, players, roster memberships, games, goals, and league audits, and explicit score/goal-reconciling certification. See `docs/league-persistence-v1.1.md`. The data on first launch is fictional demonstration content. Run `node --test tests/browser/*.test.js` (56 tests in this build).
