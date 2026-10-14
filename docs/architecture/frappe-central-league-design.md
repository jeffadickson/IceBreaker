# IceBreaker Frappe central-league technical design
**Revision:** M2 architecture baseline — 2026-10-13  
**Implementation status:** source and contract tests exist; no live Frappe Bench deployment or approved production cutover.

## 1. Executive assessment

Frappe is a good fit for **league administration**: records, configurable forms, workflows, user roles and scheduled administrative work. It is **not** the official clock, scoring journal or referee-certification engine. Keep the independently running rink-local Node/SQLite authority and native .NET/Avalonia timekeeper.

The current app is `apps/frappe/icebreaker_league` and targets **Frappe v16**. Seven DocTypes are source controlled: League, Season, Division, Club, Team, Game and League Access. M1 admin and M2 schedule snapshot contracts and importers are present. League Admin can read a scoped schedule through a permission-gated method, but generic DocType access is still reserved for System Manager. OTel spans are opt-in and allowlisted. All imports are **fictional data only**.

### Verified source-level status vs unverified runtime

| Capability | Current evidence | Missing acceptance |
|---|---|---|
| Frappe package and DocTypes | `pyproject.toml`, `hooks.py`, seven JSON DocTypes, controllers | Actual v16 Bench install/migrate, Desk CRUD |
| Stable IceBreaker IDs | `autoname: field:icebreaker_id`, unique field; M1/M2 contracts | Cross-system roundtrip against running DB |
| Admin metadata migration | `snapshot_contract.py`, `importer.py`, Node exporter | MariaDB-backed idempotency/rollback, tenant conflict tests |
| Schedule migration | `schedule_contract.py`, `schedule_importer.py`, Node exporter | Live DST/timezone parity, schedule change workflow |
| Scoped schedule reader | `access.py`, `access_rules.py`, `IceBreaker League Access` | Real Frappe role/permission query tests with two tenants |
| Certified scores/results | Excluded from game DocType and import contract | Signed, idempotent result projection (M3) |
| Roster/training/suspensions | Existing Node domain models only | Frappe policy models and signed offline snapshots (M3) |
| Parent/private registration | Separate development registry/vault | Dedicated secure service, KMS, consent, migration (M4) |
| OpenTelemetry | `observability.py`, `otel_bootstrap.py` | Real collector, request correlation, retention and privacy review |
| Operations | Development migration runbook | Backups, restore drill, HA, monitored cutover |

## 2. Component ownership

```text
                  LEAGUE / CLUB ADMINISTRATORS
                            |
                     Frappe Desk + APIs
                            |
             [Frappe League administrative DB]
                |           |            |
             schedules    policies     approvals
                |           |            |
                +------ signed versioned export ------+
                                                      |
                                               [Rink cache]
                                                      |
               [Native Windows timekeeper] -> [Local game authority]
                                                     |
                                       clock + immutable event journal
                                                     |
                                        referee review/certification
                                                     |
                           certified result envelope (future M3)
                                                     |
                          [Frappe result projection, not live clock]

  [Family / guardian] -> [protected registration + document vault]
                               | minimal verified eligibility facts
                               +----------> Frappe policy projection

  [Frappe / rink services] -> [OpenTelemetry Collector]
                       diagnostics only, never business authority
```

**Source of truth during migration:** the existing Node/SQLite league data remains authoritative for central administration until a separately approved cutover. The rink authority remains authoritative for live games **after** the central migration too.

## 3. Frappe data model (implemented)

| DocType | Stable identifier | Parent / links | Notes |
|---|---|---|---|
| IceBreaker League | `icebreaker_id` | — | title, IANA timezone, public scoreboard flag |
| IceBreaker Season | `icebreaker_id` | League | start/end date |
| IceBreaker Division | `icebreaker_id` | Season | rules version |
| IceBreaker Club | `icebreaker_id` | League | optional association through Team |
| IceBreaker Team | `icebreaker_id` | Division, optional Club | short name |
| IceBreaker Game | `icebreaker_id` | Division, Home Team, Away Team | schedule fields only; **no scores** |
| IceBreaker League Access | `icebreaker_id` | User, League | enabled membership; System Manager manages |

The Frappe document `name` currently equals the stable IceBreaker ID via `autoname`; integrations must nevertheless use the explicit stable-ID contract, not assume future Frappe naming will never change.

**Schedule timestamp contract:** preserve (a) source ISO-8601 timestamp with explicit offset, (b) canonical UTC timestamp, (c) UTC-naive value for Frappe Datetime. The current importer validates source offset against the league's IANA timezone. **Open issue:** games hosted in another timezone need a venue-specific timezone rather than assuming the league's timezone.

## 4. Service APIs and permissions

### Existing (development)
- `icebreaker_league.importer.preview_admin_snapshot`: System Manager, read/dry-run.
- `icebreaker_league.importer.import_admin_snapshot`: System Manager, POST, idempotent insert-only.
- `icebreaker_league.schedule_importer.preview_schedule_snapshot`: System Manager, read/dry-run.
- `icebreaker_league.schedule_importer.import_schedule_snapshot`: System Manager, POST, idempotent insert-only.
- `icebreaker_league.schedule_importer.league_schedule`: System Manager or IceBreaker League Admin **with enabled membership in that exact league**, read-only.
- `icebreaker_league.api.league_overview`: System Manager, administrative projection.

**Security rule:** Frappe `@frappe.whitelist` exposes a method but does **not** imply per-record authorization. Every custom API must check scope and use permission-aware access; `frappe.get_all` bypasses normal permissions, so it is allowed only after explicit tenant scoping. The current schedule API uses explicit membership and league/division filters. Do not grant broad generic DocType rights to league administrators before list and document permission hooks are tested.

### Planned M3 integration contracts
- `rules_snapshot`: game UUID, policy version, roster/eligibility version, expiry, issuer/key ID, signature, generated UTC; no addresses, DOB, certificates or contact details.
- `certified_result`: game UUID, monotonic revision, journal digest, certification digest, signer identifiers (internal IDs), issued UTC, idempotency key, signature.
- Validate signature, authorization, schema version, freshness and idempotency before applying. Repeated same envelope is a no-op; same game/revision with different digest is a conflict requiring review. No central write may modify the rink clock or event journal.
- Signed snapshots must remain usable when Frappe or the network is unavailable. Define revocation/expiry policy for already-started games.

## 5. Privacy and tenancy

- Administrative DocTypes must not store children's birth certificates, addresses, guardian contact details, full registration numbers, or private document files.
- A dedicated protected registration/vault service will own these records and release only necessary eligibility assertions.
- Separate scopes: System Manager (pilot import), League Admin (specific league), future Club Registrar (specific club), Manager (specific team), Parent/Guardian (verified child), Public (approved projections only).
- Enforce scope for list, read, write, link search, export, report, print, file attachment, background job and whitelisted API. A UI filter is **not** an authorization boundary.
- Frappe permission query conditions and `has_permission` must be tested together before general DocType access is granted.
- Production requires HTTPS, MFA, secret/KMS management, immutable audit retention, backups/restore, data retention and security review.

## 6. OpenTelemetry

- Use `service.name=icebreaker.league-frappe` and a trusted **local OTLP Collector**.
- Existing manual spans allowlist: league.overview, league.schedule_read, league.import_preview, league.import_commit, league.result_receive (last is reserved for future result ingestion).
- Allowed span attributes: fixed operation and outcome. Never capture raw HTTP bodies, SQL bindings, names, DOB, emails, documents, registration IDs, tokens, event payloads or passwords.
- Use W3C trace context for future authenticated cross-service calls. Trace context must never grant permissions.
- Collector failure must not block Frappe transactions or local rink scoring. Logfire is an optional visualization/export backend, not an application framework dependency.
- Before deployment test collector outages, dropped spans, retention and accidental PII instrumentation.

## 7. Implementation plan and go/no-go gates

| Milestone | Scope | Exit criteria |
|---|---|---|
| M0/M1 | App skeleton, admin DocTypes, fictional import | Live Bench install, schema/CRUD validation, repeat-import/conflict rollback |
| M2 | Schedule DocType, timezone contract, scoped read-only API | Two-tenant permission tests, DST/venue tests, old/new schedule parity |
| M3 | Rules/roster/training snapshots and certified-result projection | Signed envelopes, offline replay, duplicate/conflict/revision tests, no clock dependency |
| M4 | Secure registration and guardian workflows | KMS, consent/identity proofing, encrypted document handling, audit/retention |
| M5 | Mobile manager/referee/public projections, OTel operations | Device and permission tests, privacy-safe trace correlation, accessibility |
| M6 | Controlled cutover | Reconciliation, backups and restore drill, rollback rehearsed, two-laptop full-game acceptance |

**Current go/no-go:** NO-GO for real league data or replacing the old league server. Development implementation is meaningful but source-level tests are not a substitute for a live Bench and independent security review.

## 8. Immediate engineering priorities

1. Install the app on a disposable Frappe v16 Bench and execute real migration, CRUD and two-tenant authorization tests.
2. Add venue timezone to schedule contracts and verify away-tournament DST behavior.
3. Define signed M3 roster/rules and certified-result JSON schemas before adding mutable Frappe workflows.
4. Implement explicit permission hooks and league-scoped administrative forms; keep System Manager-only fallback until tested.
5. Add end-to-end OTel collector smoke tests, plus database backup/restore and migration rollback.

## 9. References

- [Frappe DocType model](https://frappe.io/framework/doctype)
- [Frappe whitelisted methods](https://docs.frappe.io/framework-git/server-side/whitelisted-methods)
- [Frappe permissions in code](https://docs.frappe.io/framework-git/server-side/permissions-in-code)
- [Frappe hooks](https://docs.frappe.io/framework-git/server-side/hooks)
- Internal: `docs/architecture/adr-001-frappe-league-administration.md`, `requirements/frappe-league-migration.md`, `docs/architecture/frappe-migration-runbook.md`
