# League daily scoreboard and mobile team manager (development increment)

## Requirements
- **BOARD-001 P0:** Public scoreboard SHALL list all games for one league calendar day, across all divisions in the selected season, including names such as 10U A, 10U BB and 10U B.
- **BOARD-002 P0:** Games SHALL retain stable season, division, team and game IDs, without merging teams or standings across divisions.
- **BOARD-003 P0:** Users SHALL filter by date, season and division, with a default league-local day and timezone-aware conversion of UTC game start timestamps.
- **BOARD-004 P0:** Each card SHALL show participating teams, scheduled start, venue, game status, and either provisional or certified score. Unreported scores SHALL display unknown, not zero.
- **BOARD-005 P0:** Spectator APIs SHALL be read-only, expose only permitted information, and never apply arena mercy-rule score masking to a live parent scoreboard.
- **BOARD-006 P1:** The central league scoreboard SHALL ultimately combine every authorized remote rink's published live projection, not only the single locally bound game.
- **MGR-020 P0:** A logged-in manager SHALL be able to open a mobile game page, review the scheduled matchup and the team's game-day lineup, select participating players and confirm with an explicit action.
- **MGR-021 P0:** Manager game details and writes SHALL be restricted to their assigned team by backend checks, with audited roster confirmation.
- **MGR-022 P0:** Game page SHALL distinguish roster confirmation from official referee approval; it SHALL display an available scoresheet revision without revealing private referee credentials.
- **MGR-023 P1:** The manager game page SHALL eventually persist configurable league checklists, evidence uploads and receipts in SQLite, with role-specific authorization. Current page links to the workflow documentation; no connected checklist edit is claimed.
- **MGR-024 P1:** Responsive game page SHALL work on a phone browser without installation and support keyboard and screen reader labels.

## Implemented
- `GET /api/league/v1/scoreboard?date=YYYY-MM-DD&season=<id>&division=<id>` using `LeagueStore` tables. Division and season parameters are optional. Calendar grouping uses `America/Los_Angeles` until league timezone configuration is stored.
- `apps/rink-local/web/scoreboard.html`: public read-only date/season/division filter.
- `GET /api/team/v1/teams/:teamId/games/:gameId/summary`: authenticated team-scoped summary.
- `apps/rink-local/web/manager-game.html`: mobile game view with roster confirmation through the existing audited team API.

## Test matrix
- **BOARD-T01:** Multiple divisions within same season remain grouped separately.
- **BOARD-T02:** A start time near UTC midnight appears on the correct league-local date.
- **BOARD-T03:** Invalid date/division rejected.
- **BOARD-T04:** Public scoreboard API and browser page served.
- **MGR-T01:** Anonymous manager summary rejected; existing team tests enforce cross-team permissions.
- **MGR-T02:** A team manager can review game status and confirm roster with existing API; complete real-mobile browser E2E pending.

## Known limits
This is the local prototype's league-data API, **not** a deployed 3,000-team distributed scoreboard. The existing demonstration dataset seeds one 10U demonstration division; the model and endpoint support multiple divisions when populated. It does not automatically aggregate all remote rink streams. The scoring authority may project live totals for one explicitly bound fixture; certified results come from the league database. PWA, evidence uploads and persistent manager checklist integration are separate milestones.
