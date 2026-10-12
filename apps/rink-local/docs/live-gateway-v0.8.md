# Icebreaker v0.8 — spectator score policy and .NET read-only gateway

## Approved policy

- **Live parent tracker:** full official score, every approved goal, penalty and period transition, regardless of mercy.
- **Arena physical scoreboard:** mercy-capped differential when league policy requires it.
- **Operator scorekeeper:** full official score and private action/audit history.
- **Security:** no public write endpoints; only approved event fields are projected.

## Development implementation

- `server/live-server.js` still serves the *working* local browser demo with HTTP SSE.
- `src/Icebreaker.SpectatorGateway` adds an ASP.NET Core 8 read-only spectator bridge, supporting SSE and a SignalR hub. It reads the existing SQLite event journal **read-only** and never writes official events. It broadcasts a complete snapshot when a journal revision changes. Its public API matches `web/live.js` SSE endpoint names. Operator demo controls are intentionally unsupported on this bridge.
- This is a scaffold requiring compilation/integration verification. The existing C# event model does not yet implement period transition events; those will not be published until the core supports them.
- For the .NET bridge, set `ICEBREAKER_GAME_DB` to the authoritative SQLite file, `ICEBREAKER_GAME_ID` to the game ID, and run `dotnet run --project src/Icebreaker.SpectatorGateway`.
- The bridge listens only on 127.0.0.1:5080 by default. To view the HTML via the bridge, the next iteration must add static asset hosting or serve the web folder separately. Production internet exposure requires TLS, guardian permissions, identity, and cloud sync—not implemented.

## Test boundary

JavaScript unit and local HTTP tests are executed. The .NET project has **not** been compiled in this environment (SDK unavailable), so its implementation is a reviewable integration scaffold, not a verified release.

## Data contract note

The SQLite core uses `GoalId` for corrections; the web play-by-play uses the original `EventId`. The .NET projection resolves the mapping before emitting a correction, ensuring it updates the existing goal row rather than displaying an extra goal. The .NET scaffold requires compiled integration tests before use.
