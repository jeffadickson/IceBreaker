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
