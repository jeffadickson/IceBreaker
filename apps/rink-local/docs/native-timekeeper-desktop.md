# IceBreaker native Windows timekeeper

Status: development milestone. Native Avalonia/.NET 8 window and separately running Node/SQLite authoritative rink service. The timekeeper does **not** need a browser; parents and managers may continue to use web pages.

## Start on Windows

Install .NET SDK 8+ and Node.js 22.13+. From the repository root run `START_ICEBREAKER_DESKTOP_WINDOWS.cmd`. The launcher checks `http://127.0.0.1:8090/api/health`, starts the rink authority as an **independent** OS process if absent, and launches the native timekeeper. It never opens a browser. The backend PID is written to `apps/rink-local/data/timekeeper-authority.pid`, with stdout/stderr logs in the same directory. This is a development launcher, not an installed Windows Service.

The native executable project is `apps/rink-local/src/Icebreaker.Timekeeper.Desktop`. Publish with:

```powershell
dotnet publish apps/rink-local/src/Icebreaker.Timekeeper.Desktop/Icebreaker.Timekeeper.Desktop.csproj -c Release -r win-x64 --self-contained false -o out/desktop
```

GitHub Actions also publishes a Windows x64 artifact. The artifact is the desktop client, **not** a complete installer containing the local Node authority, service registration or drivers.

## Authority boundary and recovery

The desktop client uses `GET /api/games/demo/snapshot` for official time and `POST /api/operator/command` for journaled actions. The local server owns monotonic time and persistent event journal. The Avalonia `DispatcherTimer` merely polls the authority for display; it never advances or stores official time.

Close or kill the Avalonia process: the separate rink authority continues. Reopen the app: it reads a fresh authoritative snapshot and reconnects. Disconnect from the backend: controls disable and the UI shows `DISCONNECTED — OFFICIAL CLOCK STATUS UNKNOWN`; it does not pretend the last cached time is current. If the authority process crashes, the server's existing recovery behavior records a STOP command on startup using the last committed journal time. **Time elapsed since the last commit is not reconstructed**; the operator must verify and synchronize with the arena clock.

A browser crash does not affect the native timekeeper. The browser is not part of the desktop timekeeper's critical path.

## Controls

- SPACE: start/stop unless typing in an input field
- ±1 second: only while stopped; game and penalty clocks correction scope
- MM:SS + reason + explicit checkbox: stopped-clock manual sync, game-only scope
- End period / next period / begin overtime: validated by authoritative rules
- Warmup / intermission / auxiliary start/pause: separate clock, never game or penalty time
- Native penalty assessment form (team, jersey, infraction, duration) and team timeout controls; server validates and journals requests
- Game score, ruleset version, penalty state, connection status: server-sourced

All command requests carry a unique idempotency key and an operator identity. The current server still uses a **development shared key** and must not be exposed on public interfaces. Set `ICEBREAKER_OPERATOR_KEY` consistently in both authority and desktop environments and `ICEBREAKER_OPERATOR_ID` to identify the operator; proper RBAC is outstanding.

## Acceptance and remaining work

.NET tests exercise snapshot reads, start/stop, correction validation, unique command keys, and disconnected authority. GitHub CI compiles the Avalonia desktop and publishes a Windows artifact. **Windows physical-machine smoke testing, forced desktop process termination while the authority runs, independent authority crash recovery, signed installers, OS service registration, external scoreboard drivers, and end-to-end full-game timekeeper acceptance are not yet complete.** Do not treat a successful compile as those tests passing.

The redesigned native console has a fixed scoreboard/clock header and tabs for clock/periods, scoring, event history and PA. Basic goal/assist entry and goalie substitutions are now present, in addition to clock/phase operations, basic penalties and team timeouts. Goal and goalie forms currently use typed jersey numbers rather than a confirmed-roster picker; the backend enforces roster validation. Advanced penalty classifications, amendments and referee review remain separate or incomplete. These can be added as native screens or separate operator stations; no duplicate clock authority should be introduced.

## UI iteration 1

The official clock and score remain visible while changing tabs; the desktop still has no local authoritative countdown. The scoring tab can submit GOAL_RECORDED with scorer and up to two assists (NONE permitted), basic PENALTY_ASSESSED, and GOALIE_CHANGED including EMPTY. Goal entry requires explicit verification. Events are shown only after being committed to the backend. Referee mobile signing is a separate page; see [iterative UI and signing requirements](../../../requirements/operator-ui-and-mobile-signing.md).

Next: roster-backed jersey picker, more complete penalty operations, amendment workflow, laptop/touchscreen field usability tests and signed desktop installer.
