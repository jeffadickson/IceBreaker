# Native laptop timekeeper — release requirements

Status: development desktop client over the independent rink-local authoritative service. Windows first; Avalonia permits other desktop platforms. The local Node/SQLite service remains the **only** clock authority until the unified .NET service replaces it; a desktop app is a client, not a second timer.

| ID | Priority | Requirement | Acceptance |
|---|---|---|---|
| DESK-001 | P0 | A packaged native Windows desktop executable SHALL provide the primary timekeeper interface, with no browser dependency. | Start native window with no browser open |
| DESK-002 | P0 | Game-clock time SHALL be owned by an independent local process, not UI timers. | Kill desktop process; backend clock still advances |
| DESK-003 | P0 | Restarted desktop SHALL read a fresh authoritative snapshot before permitting controls. | Close/relaunch; time matches backend |
| DESK-004 | P0 | Loss of local authority connection SHALL show prominent DISCONNECTED and disable mutating controls. | Stop backend while UI open |
| DESK-005 | P0 | Every command SHALL use unique idempotency key, operator identity, and server-side validation/audit. | Inspect committed journal; retry duplicate |
| DESK-006 | P0 | SPACE SHALL toggle start/stop, except while typing in an input field; touch controls SHALL be large. | Keyboard and touchscreen test |
| DESK-007 | P0 | ±1s correction SHALL be possible only when stopped; full MM:SS correction SHALL require reason and operator confirmation. | Reject running, negative and overlong corrections |
| DESK-008 | P0 | Game phases, penalty clocks, and ruleset version SHALL display from server snapshots. | Compare to local authority response |
| DESK-009 | P0 | Desktop UI crash SHALL NOT terminate the rink-local authority; authority restart SHALL recover stopped with last committed time. | Independent process termination and restart |
| DESK-010 | P0 | Local play SHALL require no internet, cloud login or public browser. | Disconnect WAN, run game |
| DESK-011 | P0 | Separate launcher SHALL start/reuse rink authority and launch desktop without tying service lifetime to UI lifetime. | Close desktop; backend still responds |
| DESK-012 | P1 | Warmup, intermission, timeout countdowns and period controls SHALL be available in native UI. | Operator exercises all supported phases |
| DESK-013 | P1 | Publish reproducible Windows x64 desktop package, startup procedure and recovery runbook. | Clean-machine smoke test |
| DESK-014 | P0 | Production operator authentication SHALL replace the shared development key; bind commands to named timekeeper role. | RBAC/security tests |
| DESK-015 | P0 | Full-game crash/fault-injection acceptance suite SHALL pass before rink deployment. | Full regulation/overtime, UI kill, server kill, reconnect |

## Current implementation boundary

The first native Avalonia client uses the existing loopback rink authority HTTP API and never computes authoritative time. The local authority survives desktop process exit, and desktop controls reconnect from snapshots. This is an **integration milestone**, not a production certified binary. Operator-key authentication, native packaging smoke tests, and hardware scoreboard drivers remain release gates.

A browser may still serve parents, managers and league administrators; the timekeeper does not depend on it.
