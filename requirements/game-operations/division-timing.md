# Division Game Timing — Requirements

State: development implementation. Hockey is the initial sport, but timing-policy persistence is a sport-neutral platform capability. Rule interpretation is sport-specific.

- **TIME-001 P0:** A game SHALL resolve a versioned timing policy from its assigned league division and pin that policy and version at game initialization.
- **TIME-002 P0:** The policy SHALL include regulation period count and length, warm-up duration and intermission duration. Overtime duration is reserved configuration pending detailed sport-specific implementation.
- **TIME-003 P0:** Official game clock actions SHALL reject negative time, non-integer seconds, and remaining time exceeding the configured period length.
- **TIME-004 P0:** The operator SHALL NOT be able to advance beyond the configured final regulation period.
- **TIME-005 P0:** The next period SHALL initialize at the configured period length, not a hard-coded 15-minute default.
- **TIME-006 P0:** A game's timing policy SHALL survive process restart; an attempted implicit policy switch SHALL be rejected.
- **TIME-007 P0:** Warm-up and intermission clocks SHALL be separate from the official regulation and penalty clocks, using the configured durations.
- **TIME-008 P0:** Starting, pausing and resetting auxiliary timers SHALL require operator authorization, persist an audit history and recover stopped after restart.
- **TIME-009 P0:** A manual clock correction SHALL use the policy's range rather than an unrelated global 60-minute limit.
- **TIME-010 P0:** Updating division timing SHALL create a new version and audit event, with no in-place overwrite of the timing policy for in-progress or finalized games.
- **TIME-011 P1:** The rink operator SHALL see the effective ruleset version, period length/count and auxiliary durations.
- **TIME-012 P1:** Authorized league administrators SHALL edit division timing with a validated, accessible browser interface.
- **TIME-013 P1:** Official overtime, running-time, timeout and division-specific transition rules SHALL be added through the sport module; the presence of an overtime field alone does not imply that overtime is implemented.

## Verification

| Test file | Coverage |
|---|---|
| `division-timing-rules.test.js` | bounds, period count, pinned version, admin API |
| `auxiliary-clock.test.js` | warm-up/break operation, history, crash recovery and protected API |
| `clock-arrow-nudge.test.js` | time adjustment scopes and stopped-clock restriction |
| `game-operations-v2.test.js` | clock and penalty integration regressions |

## Known limitations

The local server is development-only. Default game rules use 3 × 15:00, with a 5:00 warm-up and 2:00 break, which are **example values rather than official league rules**. League rules must be verified and configured before real play. A division with already-live/final games cannot have its active ruleset changed using this simple admin form; future season/version migration tooling is separate work. The auxiliary timer is local to the rink and remains independent from the parent-scoreboard feed. Overtime metadata is reserved, not an executable hockey overtime ruleset.
