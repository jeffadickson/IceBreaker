# IceBreaker electronic game workflow — lightweight implementation
Updated 2026-10-12

## Operation
1. Create a scheduled league game and bind the rink to its ID using `ICEBREAKER_LEAGUE_GAME_ID`.
2. Each assigned team manager logs in and confirms the game-day roster from the season roster. The server stores the manager ID, roster version, player IDs and confirmation time.
3. An authenticated rink operator can view `GET /api/scoresheet/v1/pregame` to check whether both teams have confirmed. Unbound demo games report `bound: false`.
4. The scorekeeper operates the game and records shots, goals, penalties, clock events and corrections in the append-only game journal.
5. After `GAME_ENDED`, the operator submits the provisional scoresheet. **Bound league games refuse submission until both team rosters are confirmed.** The submitted revision embeds the immutable roster evidence snapshot and SHA-256 digest.
6. Assigned referee signs in separately. Before an approval, IceBreaker rechecks the underlying event sequence **and** the roster-evidence digest, refusing to sign a stale revision.
7. A referee can request a correction. The scorekeeper appends an audited postgame scoring attribution correction, resubmits a new revision and obtains a new referee approval.
8. Certification queues exact-revision league publication and parent-report jobs in SQLite. Delivery retries are deduplicated by revision/digest. An authorized operator can inspect job status and retry blocked jobs.

## Configuration
- The workflow definition is version-pinned: `config/workflows/electronic-scoresheet-v2.5.json`.
- The interpreter and history run in-process: `apps/rink-local/server/workflow-runtime.js`.
- The scoresheet/signature authority: `apps/rink-local/server/scoresheet-certification.js`.
- The pregame evidence gate: `apps/rink-local/server/pregame-gate.js`.
- The optional Elsa integration is **disabled by default** and not required.
- No extra service is needed to execute normal workflows.

## Requirements / traceability
| ID | Testable behavior | Test |
|---|---|---|
| WFLOW-101 | Bound game requires both teams' roster confirmation before submission | pregame-gate.test.js and scoresheet integration |
| WFLOW-102 | Roster revision, manager ID, player IDs and confirmation timestamp included in signed source | pregame-gate.test.js |
| WFLOW-103 | Changing a confirmed roster invalidates the submitted digest before referee signing | pregame-gate.test.js; needs additional HTTP E2E coverage |
| WFLOW-104 | Corrections append a journal event and require resubmission and a new digest | workflow-runtime.test.js |
| WFLOW-105 | Certified result publication and parent email queue are deduplicated | workflow-runtime.test.js |
| WFLOW-106 | A restarted rink server preserves workflow instance, approvals and outbox status | workflow-runtime.test.js |

## Release limits
This is a development implementation, **not yet a production-certified sports administration service**. The existing team manager account endpoints use development credentials; referee approval isn't legally certified e-signature. Email transport is not connected. Manager checklists, upload receipts, late roster amendments, post-certification revisions, and fully automatic background delivery remain separate requirements. A league may still require printed scoresheets.

**Security boundary:** Sport-neutral workflow JSON must not decide whether an individual is actually a manager/referee or whether a signature is authentic. Those checks stay in the application code.
