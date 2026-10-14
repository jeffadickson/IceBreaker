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
| FRAPPE-007 | P0 | Separate central schedule ownership from rink certified results | Contract tests |
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
