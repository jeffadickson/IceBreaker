# Mercy rules — v0.3 design and integration requirements

This module provides a **pure rules evaluator** and public-score projection; it does **not** yet control a live clock, scoreboard device, or journal transitions.

## Operator configuration
- Enable independently for league/tournament/game.
- Trigger goal differential (inclusive, `>=`), minimum eligible period, dynamic or latched-for-game activation.
- Independently enable running clock and public-score differential cap; configure the displayed cap.
- Show **official score** and **public scoreboard score** separately in authorized operator/review UI.
- Operator override must be role-restricted, justified, and auditable. Official score is never truncated.

## Examples
With threshold 5, public differential cap 5, active in period 2:
- 6–2 => public 6–2 (not triggered)
- 7–2 => public 7–2 (triggered)
- 9–2 => public 7–2
- 10–3 => public 8–3
- 2–10 => public 2–7

The displayed score is recomputed from the official score, not incremented independently. With a latched rule, the cap remains enabled after the lead narrows, but does not alter a smaller differential.

## Clock stop semantics
Ordinary whistle, goal and penalty stop requests are ignored while mercy running-clock mode is active. Injury, official timeout, period/game end and operator safety stops still stop the clock in the *sample policy*. The governing league may require additional stop reasons (e.g., penalties, goals, last two minutes); these MUST be validated and configured before deployment. Never suppress an explicit safety stop. PA final-minute cues use the **real official clock**, not a synthetic display.

## Required production integration
1. Journal `MERCY_MODE_ACTIVATED` / `MERCY_MODE_DEACTIVATED` / `MERCY_RULE_OVERRIDDEN` with configuration revision, actor, timestamp, period and official score; replay latched state after crash. Current pure evaluator does not persist it.
2. Apply running-clock decision at the **authoritative clock engine**, not by ignoring button presses in a view. Safety stop remains available to the operator.
3. Public display adapter uses `PublicHomeScore`/`PublicAwayScore`; official event journal, stats, exports and authorized review use uncapped score.
4. Broadcast both actual score and public projection only to authorized clients; public web clients must not receive actual score if concealment is required by the league's policy. Define policy for spectators, archives, and final score sheets.
5. Protect against game/period reset state leaking into another game; prevent config changes midgame except audited override.
6. Include integration tests for late goals, score corrections, disconnect/reconnect, period boundaries, replay and clock transitions.
7. Do not silently alter official scoring or hide corrections from authorized officials.

## Acceptance IDs
- MERCY-001 Configurable inclusive differential and earliest period
- MERCY-002 Configurable running-clock activation
- MERCY-003 Configurable public-score differential cap, official score preserved
- MERCY-004 Configurable dynamic/latched activation
- MERCY-005 Mandatory safety/period clock stops
- MERCY-006 Durable activation and operator overrides (not implemented)
- MERCY-007 Separate public/official data permissions (not implemented)
- MERCY-008 PA and game review consume official event/clock state (integration pending)
