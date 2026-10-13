# League schedule, editable lineup and player suspensions

## Team manager workflow

An authenticated team manager opens `/manager-game.html` or `/team.html`. The app retrieves the league schedule via `GET /api/team/v1/teams/:teamId/schedule`, scoped to the authenticated team. Only scheduled/live games are shown. Choosing a game loads its approved season-roster players and any previously confirmed game-day lineup. The manager can deselect absent players, select additional eligible players, and reconfirm while the game is scheduled. A lineup confirmation is audited and optimistic-concurrency checked. Live-game amendments still require a separate authorized process; the normal manager endpoint refuses edits to an already confirmed live lineup.

## League-owned suspension records

The league administrator alone can add a suspension using `POST /api/league/v1/suspensions`, list records using `GET /api/league/v1/suspensions`, and revoke by `POST /api/league/v1/suspensions/:id/revoke`. These use the development administrator key and are **not production-grade authentication**. The development administration interface is `/league-suspensions.html`.

A suspension requires an explicit **league ID** and a **permanent player ID**, never a jersey number. The player must be registered in that league, and suspensions do not affect games in unrelated leagues. It has an inclusive `startDate` and `endDate` in YYYY-MM-DD format. The game date is converted to the league's configured timezone; for example, a suspension for October 12 through October 19 makes a player ineligible for games scheduled on both dates. Dates are checked as real Gregorian dates. Multiple suspensions may overlap. Revocation retains the original record and an audit event, so prior administrative decisions remain traceable.

Suspensions do not remove players from the season roster. They are shown as disabled/ineligible on the manager's game-day lineup. The disciplinary **reason remains league-administrator-only** and is excluded from the manager's lineup response, the game-bound scoring snapshot, and scoresheet pregame evidence. This limits unnecessary exposure of sensitive youth disciplinary details.

The backend rejects any attempted lineup confirmation containing a suspended player. A suspension applied **after** a lineup was confirmed also makes the game-bound roster snapshot and certification pregame check unready; the old confirmation is preserved as audit evidence, but cannot authorize further play. Scheduled games can be reconfirmed without the suspended player. For live games, an authorized, audited administrator amendment workflow is still outstanding.

## Verification and known gaps

Tests cover inclusive local dates, invalid dates, player IDs, revocation, stale confirmed lineups, pregame readiness, schedule access, team isolation, and admin-only writes. Run `npm test`.

**Before public release:** Replace the development operator key with league administrator RBAC and MFA, define league suspension appeals/approval workflows, support configurable narrower suspension scope (division/team), multi-league policy exceptions, build the audited post-start lineup amendment workflow, and enforce retention and access controls on disciplinary records.
