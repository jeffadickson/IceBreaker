## Applications

`rink-local` currently contains both the prototype rink backend and browser applications.

- `rink-local/server/rink-server.js`: active Node/SQLite API and stream server.
- `rink-local/server/league-store.js`: persistent league/season/roster and result storage.
- `rink-local/web/operator.html`: scorekeeper.
- `rink-local/web/live.html`: full-score parent tracker.
- `rink-local/web/league.html`: league stats and schedules.
- `rink-local/src/Icebreaker.SpectatorGateway/`: experimental .NET gateway scaffold (not production-integrated).
- `rink-local/src/Icebreaker.Core/`: C# event engine.

These are **real source files**, not merely local mockups. Production authentication and sync remain unfinished.
