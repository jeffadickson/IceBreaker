# ADR-001: Frappe for central league administration

**Status: ACCEPTED FOR INCREMENTAL REDEVELOPMENT** — 2026-10-13  
**Scope:** IceBreaker central league administrative system. **Not** the rink-local scoring authority.

## Decision

Build a separate, first-class Frappe Framework **v16** custom app, `icebreaker_league`, inside `apps/frappe/icebreaker_league/`. Do not fork or modify Frappe core. Maintain the existing .NET/Avalonia timekeeper and Node/SQLite rink authority. Use OpenTelemetry (OTLP through an OpenTelemetry Collector) as the cross-service observability standard, with optional Logfire/Grafana backend.

Frappe v16 requires Python 3.14+ and Node.js 24+; pin framework to v16 and validate a bench installation before production. A fallback to a tested v15 branch is a separate decision, not silent version drift.

## Service ownership

| Domain | Owner | Authority |
|---|---|---|
| Leagues, seasons, divisions, clubs, teams, schedule | Frappe | Central database |
| Training catalog, requirements, season enrollment, suspensions | Frappe after validated migration | Central database |
| Private family records, guardian consent, encrypted certificates | Dedicated protected registration/vault service, integrated with Frappe | Never public DocType/File attachment by default |
| Game-day approved lineup | Central policy, signed versioned snapshot cached at rink | Rink validates local eligibility snapshot |
| Clock, goals, assists, penalties, goalie changes, event journal | Existing rink-local Node/SQLite authority | Rink only |
| Certified game results | Rink/referee certification; Frappe stores verified projection | Signed result + revision, not arbitrary editable score |
| Parent/manager mobile | Existing prototype initially, then Frappe-backed public and authenticated APIs | Scoped data projections |
| Telemetry | OpenTelemetry API/SDK and Collector | Diagnostic only, never audit authority |

## Trust and synchronization

1. A Frappe game uses the **same stable IceBreaker UUID** as the existing league database. Do not use Frappe document names as replacement external identities.
2. Central-to-rink: signed, versioned schedule/rules/roster snapshots; rink caches them for offline operation. An update does not retroactively rewrite a live game.
3. Rink-to-central: certified result envelopes with game ID, revision, digest and idempotency key. Accept duplicates idempotently, reject revision conflicts; never allow direct scoreboard writes to certified scores.
4. Central API and Frappe permissions are not interchangeable: enforce role and scope in whitelisted methods and permission query conditions. A league administrator must not access another league.
5. Private youth data is never included in telemetry, public scores, rink sync or unfiltered Frappe File attachments.
6. Existing database is retained until verified dual-read comparison, backfill reconciliation, rollback and full acceptance tests.

## Incremental migration

- **M0:** Record architecture and requirement traceability; create a minimal installable Frappe custom app and tests.
- **M1:** League, Season, Division and Team DocTypes with stable IDs and role-scoped access; import **fictional** fixtures only.
- **M2:** Game schedule DocType and central read APIs; parity tests against current league schedules and division timing.
- **M3:** Versioned roster and training policy snapshots; idempotent integration bridge and signed certified result projection.
- **M4:** Move private registration behind dedicated secure service and Frappe administrative workflows only after KMS/consent controls.
- **M5:** Mobile manager/referee/public projections, OpenTelemetry correlation and operational deployment.
- **M6:** End-to-end two-laptop acceptance, migration cutover and old central API deprecation.

## OpenTelemetry design

- Frappe emits explicitly allowlisted spans around scheduling, approvals, imports and sync, using service.name=`icebreaker.league-frappe`.
- Propagate W3C traceparent through authenticated integration calls; never use trace IDs as authorization.
- No request/response body, SQL parameters, name, DOB, email, address, document contents, registration IDs, tokens or raw game event payloads in spans.
- Export to local/trusted OTLP Collector. Sampling and exporter failure must not block league writes or rink scoring.
- Existing `apps/rink-local/server/otel-bootstrap.js` remains in place; do not add Logfire SDK as a required dependency.

## Risks / decisions still open

Frappe permission query coverage, cross-tenant link validation, v16 deployment availability, database portability, signed snapshot format, central service ownership of private data, backup/restore, and production MFA. No real minors' PII in the development app.

## Source references

- https://docs.frappe.io/framework/user/en/basics/apps
- https://docs.frappe.io/framework/user/en/basics/users-and-permissions
- https://docs.frappe.io/framework/user/en/python-api/hooks
- https://docs.frappe.io/framework/user/en/api/rest
- https://github.com/frappe/frappe/wiki/Migrating-to-version-16
- https://opentelemetry.io/docs/languages/python/

## Implementation update — M2 pilot (2026-10-13)

The fictional-data-only M2 exporter and Frappe schedule importer now preserve stable game IDs, original offset-aware timestamps, canonical UTC and legacy game status, without importing goals, scores or certified results. The `IceBreaker League Access` DocType and narrowly provisioned `IceBreaker League Admin` role support an explicitly membership-scoped **read-only schedule API**. The administrative importer remains System-Manager-only. The existing rink authority and OpenTelemetry integration are unchanged.

This is **not** a production cutover: Frappe v16 Bench installation, real DocType permission behavior, DST/venue scenarios outside the league timezone, certified-result envelopes and offline rink synchronization require separate integration tests. The current Node league database remains authoritative until an approved migration milestone.

## Architecture review and decision clarification — M2 baseline

The canonical, detailed design is now [Frappe central-league technical design](frappe-central-league-design.md). This ADR remains the **decision record**, not a claim that Frappe is deployed.

- **Implemented:** seven DocTypes (including restricted League Access), fictional M1/M2 importers, explicit UTC/source-offset schedule fields, a narrowly scoped read-only league schedule endpoint, optional privacy-filtered OTel spans, and source-level regression tests.
- **Not implemented/validated:** live Frappe v16 Bench installation, general league-admin Desk write access, real MariaDB permission and rollback tests, signed roster/rules snapshots, certified-result ingestion, private registration migration and production telemetry operations.
- **Decision:** keep generic DocType rights System-Manager-only until permission query conditions and per-document permissions are both proven in a two-league Bench integration test. An API membership check does not secure generic DocType REST access if broad grants are added later.
- **Decision:** keep league administration data separate from youth PII and preserve the independent rink clock/event journal; Frappe may store a certified projection only after authenticated M3 envelope verification.
- **Decision:** the league-timezone M2 contract is a limited pilot. Before production, distinguish venue timezone from league timezone and prove DST parity for away games.
- **Decision:** no real-player data migration or production cutover without explicit M0–M6 acceptance and rehearsed rollback.

## M4 development increment — policy administration, not private registration

The Frappe app now includes System-Manager-only Training Course and append-only Training Policy DocTypes. The read-only `league_training_policies` endpoint enforces the existing League Access role/membership boundary and returns only allowlisted training requirements. Annual/season/rolling policy selection and cross-league denial have source-level tests. The existing Node training completion ledger and rink game-day eligibility checks remain authoritative; no child records, certificates or private evidence are migrated into Frappe. This is **partial FRAPPE-013**, with live Frappe v16 Bench installation, database revision concurrency, production access validation, signed rink policy snapshots and protected evidence migration still open. See [M4 design](frappe-m4-training-policies.md).
