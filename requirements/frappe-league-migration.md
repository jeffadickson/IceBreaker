# Frappe league redevelopment requirements

**Status: ACTIVE DESIGN AND IMPLEMENTATION** (2026-10-13)

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| FRAPPE-001 | P0 | Implement a standalone `icebreaker_league` Frappe app; no core fork | Installable app skeleton |
| FRAPPE-002 | P0 | Keep existing rink-local scoring and native Windows clock authority | No rink command dependency on Frappe |
| FRAPPE-003 | P0 | Preserve stable IceBreaker league/season/division/team/game UUIDs | Fixture roundtrip and conflict tests |
| FRAPPE-004 | P0 | Model league, season, division, club, team, game as linked DocTypes | JSON schemas and controller validation |
| FRAPPE-005 | P0 | Enforce league-scoped RBAC for all list/read/write/API operations | Cross-league negative tests |
| FRAPPE-006 | P0 | Never expose private player or family data via public DocTypes or attachments | Privacy tests and security review |
| FRAPPE-007 | P0 | Separate central schedule ownership from rink certified results; preserve original offset and canonical UTC without migrating scores | M2 export, schema and DST tests; live Bench parity still pending |
| FRAPPE-008 | P0 | Import only idempotently, with dry-run and source ID mapping | Repeated import and conflict tests |
| FRAPPE-009 | P0 | Export signed, versioned game rules and approved roster snapshots to rink | Offline rink tests |
| FRAPPE-010 | P0 | Receive certified results with digest/revision/idempotency and no score overwrite | Duplicate/replay/conflict tests |
| FRAPPE-011 | P0 | Add OpenTelemetry spans/metrics with strict PII attribute allowlist | Telemetry privacy tests |
| FRAPPE-012 | P0 | Keep Frappe, OTel and central network failures from affecting official rink clock | Failure injection |
| FRAPPE-013 | P1 | Integrate training catalog, renewal, SafeSport, anti-bullying and tournaments | Policy parity tests |
| FRAPPE-014 | P1 | Provide club/league admin workflows, team managers, parent access | Role-specific UI tests |
| FRAPPE-015 | P0 | Provide rollback, database backups and staged cutover | Migration runbook and restore test |
| FRAPPE-016 | P0 | Maintain requirement-to-code/test mapping in existing tracker | Traceability entries |
| FRAPPE-017 | P0 | Production Frappe deployment requires HTTPS, MFA, secrets/KMS, audit and data retention review | Release gate |
| FRAPPE-018 | P0 | Deliver central training requirements only via authenticated, signed, tenant-bound, versioned and replay-protected policy bundles; never include participant evidence or change live rink eligibility until explicit acceptance | Python/Node contract tests; publisher, offline staging and live Bench acceptance pending |

**FRAPPE-018 progress (M4.4, 2026-10-14):** An **offline, fictional-only** Ed25519 training release publisher now validates a fresh Frappe unsigned preview, requires a named review attestation and change ticket, allocates monotonic per-league revisions in a separate transactional SQLite ledger, signs without putting the seed in Frappe, and supports exact idempotent retry. Source-level tests cover replay, tampering, expiry, revision advance and transaction rollback. **This is not production publishing**: reviewer identity is not authenticated, the ledger is not tamper-resistant, KMS and protected delivery are absent, and no live Bench or rink policy activation has been accepted. FRAPPE-018 remains PARTIAL. See [M4 design](../docs/architecture/frappe-m4-training-policies.md).

**FRAPPE-018 progress (M4.2):** The offline Node staging cache now verifies and persists fictional-only signed training policy bundles with per-league revision high-water tracking, exact replay handling, and rollback/conflict rejection. It is a separate SQLite file and cannot alter the rink clock, game journal, rosters, or training completions. A release publisher, production signing keys, live Bench integration, policy parity/activation and approved cutover remain **open**. See [M4 design](../docs/architecture/frappe-m4-training-policies.md).

**FRAPPE-013 progress (M4 pilot):** The Frappe app now has System-Manager-only Training Course and immutable Training Policy DocTypes, pure annual/rolling renewal validation, and a narrowly league-scoped read-only policy API. These contain no private person records or certificate evidence. Source-level unit and mock authorization tests are added; live v16 Bench integration, concurrent revision safety, signed policy delivery, protected evidence migration and tournament administration remain open. See [M4 training design](../docs/architecture/frappe-m4-training-policies.md).

**Migration policy:** Existing Node/SQLite league system remains authoritative until M2/M3 parity tests and an explicitly approved cutover. Frappe is not yet a production replacement. See `docs/architecture/adr-001-frappe-league-administration.md`.

## M2 schedule milestone (development)

The Frappe `IceBreaker Game` DocType now carries the original offset-aware start time, canonical UTC time and UTC-naive Frappe datetime separately. This avoids silent timezone shifts, including daylight-saving transitions. A read-only legacy state (Scheduled/Live/Final) is informational only; **certified scores are not imported**.

The fictional-data-only `export-frappe-schedule.js` emits a version-2 schedule snapshot. `schedule_importer.py` provides authenticated System Manager dry-run, idempotent import and read-only league schedule methods, rejecting cross-league divisions, mismatched teams and conflicting stable IDs. Frappe must be installed in a disposable Bench and permission-tested before any non-demo migration or change of system authority.

Remaining M2 gates: running Frappe Bench installation, schedule reconciliation with original Node league service, tenant-scoped administrator roles, venue timezone support for out-of-area games, conflict/rollback testing against a real MariaDB/PostgreSQL backend, and deployment monitoring.

## Initial tenant-scoped API access

The development app now includes a System-Manager-controlled `IceBreaker League Access` membership DocType, a narrowly provisioned `IceBreaker League Admin` role, and a read-only `league_schedule` API that requires both the role and an enabled membership for the exact league. Generic DocType access remains restricted to System Managers; no cross-league list/read/write rights have been granted. The pure access-rule unit tests cover guest, wrong-league, role-only and membership-only denial. **Live Frappe permission integration tests are still mandatory before FRAPPE-005 can be considered complete.**

## Design baseline review — current acceptance status

See [canonical technical design](../docs/architecture/frappe-central-league-design.md) for the component diagram, DocType field map, trust boundaries, APIs and cutover sequence. The table at the top lists **requirements**, not a blanket claim of implementation.

| Group | Implementation status | Release gate |
|---|---|---|
| FRAPPE-001/003/004/008 | Development scaffold, six administrative/game DocTypes and M1/M2 import contracts | Real v16 Bench install, schema migration, conflict and rollback tests |
| FRAPPE-005 | Partial: League Access role/membership and read-only API; generic DocTypes System-Manager-only | Two-league integration tests for list/read/write/link/export/report permissions |
| FRAPPE-007 | Partial: source offset, UTC and UTC-naive schedule fields, DST validation | Venue timezone model and old/new schedule parity |
| FRAPPE-009/010/012 | M3 partial: signed-result envelope, append-only Frappe projection and replay contract source/tests; roster/rules export and offline delivery not built | Live Bench integration, production signing service, signed snapshots, offline failure injection |
| FRAPPE-011 | Partial: opt-in allowlisted spans | Collector smoke, privacy scan, exporter outage and retention tests |
| FRAPPE-013/014 | Planned Frappe workflows; existing Node domain implementations retained | Role workflow and annual training parity |
| FRAPPE-015/017 | Development runbook and restricted access only | Encrypted backup/restore, MFA/KMS, consent, audit and approved cutover |

**Requirement-tracker rule:** mark source-level implementation and CI tests separately from live Frappe integration and production acceptance. Never close a requirement based only on a JSON schema or mock policy test.

## M3 certified-result pilot (source-level only)

The new [signed-result design](../docs/architecture/frappe-m3-signed-results.md) defines Ed25519 canonical envelope v3 and a System-Manager-only Frappe pilot receiver. A separate immutable `IceBreaker Certified Result` DocType stores certified score projections without modifying the schedule DocType, game journal, clock or referee certification. Signature verification, fictional-data gate, idempotent duplicate handling, conflicts and monotonic revisions are unit-tested. **This does not complete FRAPPE-010:** live Frappe v16 Bench migration, production issuer key management, source-side signed result generation, service authentication and retry/reconciliation still need acceptance.

## M3 outbound rink schedule pilot (2026-10-13)

A **schedule-only**, fictional-data Ed25519 contract has been added as the first central-to-rink exchange:

- `icebreaker_league.rink_schedule_bundle`: strict, sorted schedule payload, canonical JSON, Ed25519 sign/verify helpers, issuer- and league-pinned public keys, expiry and replay-window validation. No private fields, rosters, rules, scores or live clock state are included.
- `icebreaker_league.rink_schedule_export.preview_unsigned_rink_schedule`: a league-scoped **unsigned preview** of administrative schedule data. The API is not an authoritative signed release.
- `apps/rink-local/server/frappe-schedule-verifier.js`: read-only Ed25519 verification for future offline staging. **It does not import or apply any schedule to the rink authority.**
- Python and Node negative tests cover signatures, cross-league keys, tampering, expiration, unexpected PII fields and duplicate games.

This is **partial FRAPPE-009**, not a completed signed roster/rules snapshot system. Remaining: real Bench integration, KMS-backed signing service, monotonic published release revisions, a protected delivery channel, rink-side atomic staging/apply, offline fallback and rollback, roster and game-rule contracts, and end-to-end acceptance. Never treat an unsigned preview as a trusted snapshot.

## M3 signed schedule v2 staging increment (source-level, not production)

A version-2 Ed25519 schedule bundle now includes a signed positive `release_revision`. Python and Node validation support v1 for legacy read-only verification and v2 for revisioned releases. The rink-side `frappe-schedule-staging.js` accepts **only v2** into an independent persistent SQLite cache, atomically tracks the highest accepted revision per league, rejects rollback and same-revision conflicts, and allows exact duplicate replay. It does not touch the authoritative rink SQLite game, clock, roster, or event journal. `stage-frappe-schedule.js` is an offline fictional-data CLI, not an Internet-facing service.

**FRAPPE-009 remains partial:** the bundle currently contains only schedule fields, not approved roster IDs or game rules. No production KMS release signer, tamper-resistant high-water storage, operator-authorized activation, live Frappe Bench integration, or dual-laptop field validation is implemented. Do not mark FRAPPE-009 or production cutover as complete.
