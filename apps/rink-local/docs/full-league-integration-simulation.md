# IceBreaker — Full League Integration Simulation

## Milestone 1: synthetic league and end-to-end game

**Implemented and exercised by GitHub CI.** This is a deterministic test harness with fictional people and clubs, not a live-season deployment or a substitute for security acceptance testing.

### Synthetic league

| Dimension | Fixture |
|---|---|
| Division | `sim-10u`, separate from existing `demo-10u` |
| Teams | 8 |
| Players | 120 (15 per team; 2 available goalies per team) |
| Schedule | Double round-robin, 56 fixtures; each team plays 14 games |
| Certification | 56 imported certified results via `LeagueStore.certifyGame` |
| Goals | One home goal per game; one assist |
| Goalie reporting | Both goalies receive credited shots in each game |
| Publication | Certified-only standings, skater totals and goalie totals |
| Recovery | Close and reopen SQLite, compare all aggregates |

The test verifies the conservation identities:

- Total goals for = total goals against = 56.
- Each team: 14 games, 7 wins, 7 losses, 14 standings points.
- Each player's games played = 14.
- Each team's designated scorer has 7 goals; designated assisting player has 7 assists.
- Every goalie row obeys `shotsAgainst = saves + goalsAgainst`.
- Invalid certification payloads leave no partial goal rows.
- Recertification of an immutable final game fails.
- Division-scoped reporting does not mix fixtures or players from other divisions.

### Game-day eligibility scenarios

A second test uses the same 8-team fixture to exercise league suspensions, appeals, annual anti-bullying training, team-manager lineup confirmation, and a **late suspension that invalidates a previously approved lineup**. Revocation of the late suspension restores readiness. Training records remain person-bound and season-scoped.

### Full event → referee → league publication scenario

A separate HTTP integration test binds a scheduled league game to the rink-local server and exercises:

1. Managers confirm the two eligible lineups.
2. The timekeeper records starting goalies, shots, a penalty, goalie substitutions (including a skater taking over in goal), a goal and assist, and game end.
3. A referee logs in, reviews the exact scoresheet revision and signs it.
4. The certified-delivery outbox publishes the final result, resolved permanent scorer/assist IDs, and four goalie rows into the league database.
5. Re-delivery is idempotent, and a restart preserves the official journal and certified league result.

The 56-game aggregate test uses the **league certification import path** for speed. The separate HTTP test uses the complete operational chain. It would be inaccurate to claim that all 56 games were individually operated through the desktop UI.

## Run the tests

From the repository root on a supported Node.js runtime:

```bash
node --test apps/rink-local/tests/browser/full-league-season.test.js
node --test apps/rink-local/tests/browser/season-game-certification-e2e.test.js
node --test apps/rink-local/tests/browser/schema-reference.test.js
```

Run the repository's full CI for C# desktop and JavaScript regression coverage.

## Integration findings and changes

- Added `LeagueStore.snapshotDivision(divisionId, authority?)` for division-specific schedules, standings, skater and goalie statistics.
- Preserved `LeagueStore.snapshot(authority?)` for existing demonstration clients.
- Added a read-only SQLite schema introspector and schema fixture generator.
- Preserved existing certification immutability and roster eligibility gates.

## Still needed before a production release

- Simulate multiple **concurrent rink laptops** and disconnected/reconnected event synchronization with a central service.
- Test corrections and post-certification amendments across distributed replicas.
- Exercise overtime, shootouts, warmup/break periods, arena-clock drift and penalty edge cases in a large multi-game simulation.
- Link coach/manager verified training to bench authorization.
- Move private registration data out of rink-local SQLite and finish production KMS, encrypted backup/restore, consent and MFA requirements.
- Validate a real desktop UI and operator workflow under load with physical rink hardware.

This milestone is a meaningful integration baseline, **not** a claim that the product is production-ready.
