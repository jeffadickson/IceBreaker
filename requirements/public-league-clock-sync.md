# Public league scores and arena-clock synchronization

## Scope and audience
IceBreaker serves each league's schedule and daily scoreboard through a league-managed web site or hosted IceBreaker tenant. **Public game scores do not require parent login** where the league has opted into public publication. Authentication is for private features such as following teams, notifications, and team management. A parent sees all public games across that league's divisions (for example, 10U A, 10U BB and 10U B), filtered by date/season/division; divisions and leagues must not be silently conflated.

### Requirements
- **PUB-001 (P0):** Public daily scoreboard SHALL be scoped to a league ID, with division and season filters, and SHALL not show another league's private fixtures.
- **PUB-002 (P0):** League SHALL be able to configure public-scoreboard publication. When disabled, the public endpoint SHALL not return scores.
- **PUB-003 (P0):** Individual viewers SHALL be able to collapse/restore the daily scores panel without affecting data or other viewers; the preference may be saved locally without login.
- **PUB-004 (P0):** Public scores SHALL show the full approved game score, unaffected by arena mercy display caps; the status SHALL distinguish scheduled, provisional, uncertified final and certified.
- **PUB-005 (P1):** Authenticated league members SHALL retain favorite teams/players and notification settings, separate from unrestricted score viewing. League association is not itself authorization to edit game results.
- **PUB-006 (P1):** Central daily scoreboard SHALL eventually merge all authorized remote-rink live projections and flag stale sources; current local implementation only shows the explicitly bound rink's live projection.

## Arena clock synchronization
- **CLOCK-101 (P0):** Rink operator SHALL be able to correct IceBreaker's clock to the observed physical arena scoreboard remaining time (MM:SS) using a visible control.
- **CLOCK-102 (P0):** A manual arena-clock synchronization SHALL require IceBreaker's game clock stopped, a reason, and explicit operator confirmation; rejected/cancelled attempts SHALL appear in the private operator audit.
- **CLOCK-103 (P0):** Accepted time correction SHALL be appended to the authoritative journal with previous/new time, game period, reason, operator and stable event ID.
- **CLOCK-104 (P0):** Operator SHALL select the scope of a clock correction: **GAME_AND_PENALTIES** adjusts the game and currently serving penalty clocks together (default for ±1-second arrows); **GAME_ONLY** adjusts only the game clock (manual full-time sync). Corrections SHALL not change goals, shots, or penalty assessments.
- **CLOCK-108 (P0):** Clock-arrow buttons SHALL nudge exactly one second per accepted tap while stopped, immediately commit an audited event without a modal confirmation, and prevent invalid values and double-submission.
- **CLOCK-109 (P1):** An adjustment restoring time after a penalty has already expired or requiring queued/coincidental penalty reassessment SHALL require authorized referee correction; naive time restoration SHALL NOT silently revive expired penalties.
- **CLOCK-105 (P0):** Parent tracker and arena display SHALL reflect the synchronized clock through their existing live projections; synchronization SHALL NOT create a goal, shot, or penalty.
- **CLOCK-106 (P1):** Camera observer may recommend a difference for the operator to inspect, but SHALL NEVER issue an authoritative clock-synchronization command automatically.
- **CLOCK-107 (P1):** Manual clock corrections SHOULD be restricted to an authorized clock/scorekeeping role with a named identity, not a shared development key, before public deployment.

## Verification
`apps/rink-local/tests/browser/clock-sync-and-public-board.test.js` tests stop-first behavior, required reason, clock-journal/audit records, penalty remaining time and public league publication opt-out.
`apps/rink-local/tests/browser/daily-scoreboard.test.js` tests distinct divisions and league-timezone dates.

## Current limitations
The rink UI uses a browser confirmation dialog rather than a production touch keypad; the existing development operator credential is not a production identity. The public scoreboard API presently serves local league fixtures; a hosted multi-rink score feed and per-league administrator settings UI remain to be developed.
