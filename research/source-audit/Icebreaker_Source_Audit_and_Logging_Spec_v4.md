# Icebreaker — Source-code audit and specification addendum

**Audit scope:** User-supplied `IcebreakerResearch.zip` containing `openscoreboard`, `openleague`, and `Teamsster`. Extracted and inspected source files, schemas, tests, project plans, and license texts. **Static review only:** no dependency installation, test-suite execution, running UI, deployment validation, or security penetration test. Source archive may differ from upstream HEAD. All line references refer to the uploaded snapshot.

## Executive conclusions

1. **Keep Icebreaker's own C# authoritative hockey engine.** openScoreboard is a useful operator/display and penalty-state reference, but its `GOAL_HOME`/`GOAL_AWAY` commands merely increment team scores (`openscoreboard/server.ts:979-983`). No player attribution or complete immutable game history is evident in the reviewed server flow.
2. **Make durable game-event history and TBD attribution release-blocking.** The user's new requirements close the biggest practical gap between a visual scoreboard and an official youth hockey scoresheet.
3. **Adopt stronger league administration patterns.** OpenLeague contains actual Prisma models, server actions, and tests for guardian-linked players, per-child RSVP, administrative audit logs, team officials, venue surfaces/reservations, practice plans, gear, seasons, and notifications. Its README understates the breadth of the checked-in source.
4. **Treat Teamsster advanced features as patterns, not shipping software.** It contains concrete DB operations for officials, incidents, guardian relationships, and calendar feeds; `Teamsster/PLAN.md:15-90` explicitly says these workflows are deferred or unqualified for the first alpha.
5. **Do not transplant incompatible source code.** openScoreboard is BSL 1.1 (change date 2029-06-23 to GPLv3), Teamsster AGPL-3.0, and OpenLeague Apache-2.0. OpenLeague is the best license candidate, but it is Next.js/TypeScript rather than C#; copying is unlikely to be a good engineering shortcut. Preserve notices/attribution for any permitted reuse and obtain legal review before incorporating code.

## Repository-specific code findings

### openScoreboard

- WebSocket server and authenticated operator messages: `server.ts:781-803`. Once authenticated, a socket can submit commands; **exclusive operator fencing is not evident**. Icebreaker needs one authoritative operator lease and separate observer credentials.
- Game-state snapshot is written to `state.json` every five seconds: `server.ts:478-540`. This is useful crash recovery, but **not an event-by-event durability guarantee**. A failure between snapshots could lose accepted changes.
- Penalty queue, active slots, chained penalties and companion penalties: `server.ts:543-585` and `server.ts:1000-1110`. These are worthwhile references, but the rules must be verified against the selected hockey rulebook, including simultaneous/coincidental penalties, delayed penalties, goal-release rules, and manpower effects.
- Hockey configuration is data-driven: `sports-templates/icehockey-nl-playoff.yaml`. Distinguish configurable durations from full rules semantics.
- Operator, spectator display, stopwatch, localization and horn routing are separate code paths: `src/client/pages/Operator.vue`, `src/client/pages/Display.vue`, `src/client/pages/Stopwatch.vue`, `src/client/i18n/`, `server.ts:90-111`.
- Goal operations increment/decrement numeric scores: `server.ts:979-983`; no goal identity, player IDs, assist states or event correction trail in those commands.
- No dedicated unit/integration test files were identified in the extracted root code (excluding the bundled `claude_upload` duplicate). That does **not** establish that upstream has no tests elsewhere.

### OpenLeague

- Sport-neutral `Sport` enum includes hockey, lacrosse, soccer and football: `prisma/schema.prisma:192-205` (check actual enum boundaries in source). Good validation of the multisport data-model direction.
- Guardian links and per-child RSVP: `prisma/schema.prisma:398`, `lib/actions/guardians.ts:57`, `lib/actions/rsvp.ts:50`. Note authorization checks on per-child responses.
- Organization audit trail: `prisma/schema.prisma:173`, `lib/actions/audit.ts:42`. This is distinct from Icebreaker's immutable scoring journal.
- Venue surfaces and reservation controls: `prisma/schema.prisma:2158`, `:2346`, `:2452`; relevant to simultaneous ice sheets/fields and schedule conflict checking.
- Season games, tournament/event games and player stats: `prisma/schema.prisma:2888`, `:3454`, `:3519`. Use as reference for separating scheduled games, played games and stat records.
- Practice sessions, equipment needs and payments are more extensive than the README's MVP summary: `prisma/schema.prisma:1619`, `:993`, `:2728`. These should **not** expand hockey v1 scope without a deliberate product decision.
- Numerous Vitest tests are present under `__tests__/`, plus CI definitions under `.github/workflows/`. **Presence is not proof of passing tests or deployability.**

### Teamsster

- Guardian/minor relationships and notification recipient routing: `packages/db/src/guardian-admin.ts:56-306`.
- Officials' assignments, accept/decline, score submission/publication, and availability: `packages/db/src/official-admin.ts:46-267`.
- Incident reports and review status: `packages/db/src/incident-admin.ts:44-225`.
- Calendar feed token creation/revocation and iCalendar output: `packages/db/src/calendar-feed-admin.ts:24-130`, `apps/web/src/lib/calendar-feed.ts`. Its own roadmap flags subscription URL/route wiring as incomplete.
- `PLAN.md:15-90` explicitly limits the first browser alpha to a narrow synthetic-data adult pilot. Registration, officials, volunteers, payments, tournaments, and other advanced features are **not qualified released capabilities**, even where schemas and helpers exist.
- Test files exist under `apps/web/src/lib/*.test.ts` and `apps/web/tests/e2e/`; they were not run here.

## Recommended scope changes

**Release-blocking hockey v1:** durable event journal and independent text log; TBD scorer/assists; pending-attribution review; browser read-only live history and questions; exclusive game authority; penalty queue and linked-penalty rule fixtures; scoreboard/clock separation; operator-friendly recovery after crashes.

**League/tournament v1 if already in their work packages:** per-child guardian permission model; official availability/acceptance; venue surface reservations and blackout constraints; audit and rate-limited notification queues; provisional/final game publication.

**Later:** equipment checkout, practice planner, volunteer hours, payments, multi-language translations, advanced registration and waivers. Build extension points now, not complete implementations.

## Design addendum — durable human-readable scoring log

### Invariants

- SQLite is the **single authoritative source** for accepted game events. A goal/penalty/clock action is acknowledged only after the event and sync-outbox row commit in the same transaction.
- A text file is an **append-only mirror**, not a second competing authority. After commit, mirror the event in sequence order to `games/<game-id>/game-events.log` and optionally `game-events.jsonl`. The text mirror must include all accepted commands affecting the official record, including time corrections and attribution corrections.
- Each line includes `event_seq`, stable `event_id`, `game_id`, UTC timestamp, period, displayed game-clock time, actor, event type, affected team/player, and before/after values. Use a deterministic, escaping-safe format; JSONL is preferable as a canonical machine-readable text mirror, with a readable `.log` projection.
- Mirror failures are visible, retryable, and repairable by replaying journal events. On startup reconcile journal sequence with mirror sequence; never silently skip gaps or duplicate lines. If both SQLite and mirror are on the same physical disk, **they do not provide independent protection against disk failure**; provide optional removable/secondary export with nonblocking behavior.
- Crash-recovery semantics: if the SQLite commit succeeded but the mirror append did not, rebuild from the journal. If the commit did not succeed, the command was not accepted and must not appear as official. Use idempotency keys to distinguish a lost ACK from an uncommitted command.
- Respect youth privacy: no unnecessary medical, contact, birth-date, or account-secret fields in the log. Retention and export permissions must be configurable.

### Example readable log (illustrative, fictional)

```text
2026-10-11T18:46:25.123Z seq=0041 event=01J... type=GOAL_RECORDED game=1042 P=2 clock=12:43 team=HOME scorer=TBD assist1=TBD assist2=NONE score=2-1 actor=operator-7
2026-10-11T18:47:02.405Z seq=0042 event=01K... type=GOAL_ATTRIBUTION_CORRECTED target=01J... scorer=#17 assist1=#8 assist2=NONE reason="confirmed at stoppage" actor=operator-7 score=2-1
2026-10-11T18:52:11.300Z seq=0043 event=01L... type=PENALTY_ASSESSED P=2 clock=10:18 team=AWAY player=#22 rule=TRIPPING duration=120s actor=operator-7
2026-10-11T18:52:12.009Z seq=0044 event=01M... type=CLOCK_STOPPED P=2 clock=10:18 actor=operator-7
```

### Attribution model

Use a **discriminated union**, not `null` or magic player number zero:

```text
PlayerAttribution = { kind: "player", playerId: "..." } | { kind: "tbd" } | { kind: "none" }
Goal.scorer: player | tbd  (never none)
Goal.assist1: player | tbd | none
Goal.assist2: player | tbd | none
```

A goal with TBD attribution changes the team score immediately. A correction references the original immutable goal ID and updates its *projection* only, never creating a second goal. Unresolved players do not accrue individual statistics until resolved. Certification displays a blocking reconciliation queue, with league-approved override/disposition if attribution cannot be determined.

### Edge cases to test

1. Record a goal with scorer TBD, first assist TBD, second assist NONE; update scorer and first assist later; score remains unchanged.
2. Duplicate GOAL command with the same idempotency key increments score only once.
3. Kill process after journal commit but before text append; restart and rebuild exactly one line.
4. Inject text-log write failure: show persistent degraded-logging alert; preserve authoritative journal and retry.
5. Correct wrong player after official submission: require authorized correction workflow; preserve both versions and actor/reason.
6. Ensure spectator browser sees TBD without access to private player data; coach question does not alter official game.
7. Two browser/native operators simultaneously submit commands: only current lease holder is accepted.
8. Ensure assists cannot duplicate each other or the scorer; allow only documented authorized overrides.
9. Export 10,000 events and verify strict ordering, event IDs and no missing sequences.
10. Run complete hockey rules fixtures including penalty expiration/goal interactions and clock restart recovery.

## Integration and license decision

- **Do not copy** openScoreboard BSL source or Teamsster AGPL source into the Apache-2.0 Icebreaker repository without an independently vetted legal path. Reading behavior and implementing independently is appropriate; avoid reproducing source expressions.
- OpenLeague is Apache-2.0; reuse is possible with required notices, but a wholesale fork would make the project depend on Next.js/React/Prisma instead of the agreed C#/.NET stack. Prefer schema/API concepts and perhaps isolated assets or test ideas after review.
- No software was copied into Icebreaker in this audit. The source archives are retained only as reference inputs.

## Deliverables

- `feature_matrix.csv`: 30 evidence-linked feature decisions and release targets.
- `proposed_requirements.csv`: 17 testable additions for the next requirements revision.
- `repository_inventory.json`: source file counts and license fingerprints for the uploaded snapshot.

**Audit limitations:** Source-only review, no runtime validation, upstream provenance verification, dependency audit, legal opinion, or external hockey-rule certification. The uploaded ZIP contained a duplicate `openscoreboard/claude_upload` subtree, excluded from code-count calculations.
