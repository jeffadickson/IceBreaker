# Player and goalie statistics

## Existing skater statistics

The persistent league snapshot derives player games played, goals, primary/secondary assists, and points from **certified** game goal attributions. An eligible player can contribute scoring events regardless of their nominal roster position. The live rink report is explicitly provisional.

## New goalie occupancy journal

An authorized `GOALIE_CHANGED` command accepts `{type:"GOALIE_CHANGED",team:"home"|"away",player:"29"|null,reason:"..."}`. Use `player:null` when pulling a goalie (empty net). The game-bound roster gate validates the selected **jersey**, without requiring the player to be registered exclusively as a goalie. Thus a nominal goalie may skate out and a nominal skater may go into goal. Starting goalies must be assigned explicitly; absent assignment is unknown, rather than an inferred #1.

The authoritative journal stores goalie transitions, surviving recovery and replay. For each shot-on-goal event, increment shots against and saves for the **opposing active goalie**; for each goal event, increment shots against and goals against. A goal event also increments the existing team shot tally, so the operator should never separately record a shot for that goal. No goalie is credited when the net is empty or no assignment is known. Each player's per-game goalie counters remain separate from their skater points.

The rink spectator snapshot exposes `goalies` and `goalieStats`; the operator page lets the user select the current goalie or empty net. Unofficial reports include the raw goalie statistics summary.

## Important limitations before claiming official season goalie stats

- Signed scoresheets now include per-game goalie saves, shots against, goals against, substitution events, empty-net goals, and unattributed shots. Certified delivery resolves goalie jersey numbers to stable roster player IDs and verifies shot conservation. The league database persists certified goalie statistics atomically with the final game result and exposes season aggregates, games in goal, and save percentage. Historical demonstration fixtures without goalie event evidence are deliberately not assigned invented goalie statistics.
- Current shot events do not distinguish blocked/missed shots; only verified shots on goal should be entered.
- Empty-net goals are counted separately from shots that could not be attributed because no starting goalie was assigned. Both cases remain excluded from individual goalie goals against.
- We do not derive exact time on ice, start decisions, win/loss/tie decisions, shutouts, or GAA without stronger goalie-stint timing semantics and certified game decisions. Save percentage is available from certified shots against and saves (null if no shots).
- Goalie swaps while the clock is running are journaled against the game time sampled by the authoritative actor. Roster substitutions should be confirmed at the game boundary where possible.
- Goalie change does not magically create or correct historical shots. Prior shots before assigning a starting goalie remain unattributed. For production scoring, the starting goalie should be assigned before recording any shots.
- The status of the skater's listed position is not changed by an on-ice goalie substitution.

Run `npm test` for the regression suite, including `goalie-stats.test.js`.
