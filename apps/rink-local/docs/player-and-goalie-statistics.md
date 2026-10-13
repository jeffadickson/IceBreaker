# Player and goalie statistics

## Existing skater statistics

The persistent league snapshot derives player games played, goals, primary/secondary assists, and points from **certified** game goal attributions. An eligible player can contribute scoring events regardless of their nominal roster position. The live rink report is explicitly provisional.

## New goalie occupancy journal

An authorized `GOALIE_CHANGED` command accepts `{type:"GOALIE_CHANGED",team:"home"|"away",player:"29"|null,reason:"..."}`. Use `player:null` when pulling a goalie (empty net). The game-bound roster gate validates the selected **jersey**, without requiring the player to be registered exclusively as a goalie. Thus a nominal goalie may skate out and a nominal skater may go into goal. Starting goalies must be assigned explicitly; absent assignment is unknown, rather than an inferred #1.

The authoritative journal stores goalie transitions, surviving recovery and replay. For each shot-on-goal event, increment shots against and saves for the **opposing active goalie**; for each goal event, increment shots against and goals against. A goal event also increments the existing team shot tally, so the operator should never separately record a shot for that goal. No goalie is credited when the net is empty or no assignment is known. Each player's per-game goalie counters remain separate from their skater points.

The rink spectator snapshot exposes `goalies` and `goalieStats`; the operator page lets the user select the current goalie or empty net. Unofficial reports include the raw goalie statistics summary.

## Important limitations before claiming official season goalie stats

- Goalies have **provisional** per-game saves, shots against, and goals against, but certified season goalie aggregates and games-in-goal are not yet wired into `LeagueStore.snapshot`.
- Current shot events do not distinguish blocked/missed shots; only verified shots on goal should be entered.
- Net-empty goals are not yet separately counted in a dedicated EN column; the scoreboard's overall goal totals remain correct.
- We do not derive exact time on ice, start decisions, win/loss/tie decisions, shutouts, save percentage, or GAA without stronger goalie-stint timing semantics and certified game decisions.
- Goalie swaps while the clock is running are journaled against the game time sampled by the authoritative actor. Roster substitutions should be confirmed at the game boundary where possible.
- Goalie change does not magically create or correct historical shots. Prior shots before assigning a starting goalie remain unattributed. For production scoring, the starting goalie should be assigned before recording any shots.
- The status of the skater's listed position is not changed by an on-ice goalie substitution.

Run `npm test` for the regression suite, including `goalie-stats.test.js`.
