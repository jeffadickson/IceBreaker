# Versioned division game rules and clocks

Each division has a `rules_version` and immutable JSON timing policy in `division_timing_rules`. The `LeagueStore.timingForDivision(divisionId)` method resolves it; the rink-local `Authority` pins `game_timing_policy` (version and rules JSON) for each game. Never substitute live division values into a started game. A published change should receive a new version and only be assigned to eligible future games; this prototype currently blocks editing a division after live/final games exist.

## Regulation configuration

| Field | Units | Allowed | Default |
| --- | --- | --- | --- |
| periodCount | count | integer 1–9 | 3 |
| periodSeconds | seconds | integer 60–3600 | 900 |
| periodLengths | seconds[] | null or exactly periodCount entries, each 60–3600 | null |
| warmupSeconds | seconds | integer 0–3600 | 300 |
| intermissionSeconds | seconds | integer 0–3600 | 120 |
| overtimeSeconds | seconds | integer 0–3600 | 0 (disabled) |
| clockMode | enum | STOP, RUNNING, HYBRID | STOP |
| showAuxiliaryClock | bool | true/false | true |
| timeoutSeconds | seconds | integer 0–600 | 0 |
| timeoutsPerTeam | count | integer 0–9 | 0 |
| mercyRunningDifferential | goals | integer 0–99 | 0 |

When `periodLengths` is supplied it overrides `periodSeconds` for individual regulation periods. `periodSeconds` remains the legacy default. `clockMode`, timeout and mercy fields are validated policy metadata: enforcement of stop-time exceptions, automatic running-clock mercy transitions, and timeout operations still requires separate actor commands before those controls should be enabled in production.

## Authority and operational boundaries

All `CLOCK_UPDATED` and `CLOCK_SYNCED` commands validate integer remaining seconds within 0–the current period's limit. `PERIOD_ADVANCED` selects the next period's configured duration. Projection begins at the first period's configured duration. The authoritative actor checks the final event seconds before journal insertion; invalid commands do not increment journal revision. A running countdown is clamped at zero.

Arenas may use the ±1-second operator correction to align the display. `CLOCK_SYNCED` is accepted only while stopped, requires a reason, preserves the requested correction scope (`GAME_ONLY` vs `GAME_AND_PENALTIES`), and emits an auditable journal event. The penalty timing model derives active penalty remaining time from this scope. Clock correction must not accidentally change goals, shots or clock mode. Both ordinary command journaling and the JSONL operator-action audit are retained.

The independent `AuxiliaryClock` handles warmup and intermission only. It cannot start while the official game clock is running; it uses the pinned duration for reset, pauses after process recovery, and never changes official game or penalty time. Its public visibility is intended to use `showAuxiliaryClock`.

## Implemented operator workflows

The operator has explicit **Begin overtime**, **Home timeout**, and **Away timeout** controls. The authoritative journal checks overtime is configured, the final regulation period has been explicitly ended, the game is tied, and the clock is stopped. Overtime uses the configured limit and becomes final when the first overtime goal is recorded. Timeout requests require a stopped clock and enforce the per-team allowance, recording an auditable event without consuming regulation or penalty seconds. The effective clock mode is exposed in game snapshots and recomputed from the configured mercy goal differential. Auxiliary clock visibility is configurable in the operator UI.

## Lifecycle and remaining integrations

The planned operator lifecycle is warmup → regulation period → intermission → next period → final, with deliberate state transitions rather than automatic period advancement. Overtime and sudden-death completion, charged timeout limits, and dynamic mercy clock-mode selection are implemented in the Node authority. The remaining gaps are enforcing running/stop/hybrid stoppage exceptions against referee actions, automatic game stoppage scheduling, a visible timeout countdown linked to timeout events, a public auxiliary display, rink curfew, and special operator overrides. Clock mode currently describes the effective policy but does not automatically decide when the operator must stop or restart a clock.

Tests: `node --test apps/rink-local/tests/browser/division-timing-bounds.test.js`, or `npm test`. Test cases cover invalid numbers, negative time, period maximum, unequal periods, advancement, and division policy immutability.
