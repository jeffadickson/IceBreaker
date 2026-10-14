# Release traceability gate

| Requirement | Intended evidence | Current state |
|---|---|---|
| LOG — private low-level actions | Node `rink-backend.test.js`; C# OperatorActionLogTests | Development tests; not full durability proof |
| SCORE — confirmed goals/assists, TBD/correction | Node `rink-backend.test.js`; C# GameStoreTests | Development tests |
| LIVE — full-score spectator projection even in mercy | Node `rink-backend.test.js`, `full-score-policy.test.js` | Development tests |
| LEAGUE — certified stats and standings | Node `league-store.test.js` | Development tests, demo data |
| SYNC — authenticated remote stations | future adversarial integration test suite | Not implemented |
| CERT — signed ref approval | future hash, credential, replay & policy tests | Not implemented |
| PARENT — account/favorites/email | future privacy, opt-in, recipient and delivery tests | Not implemented |

| OTEL-001/002/004/006 — privacy-first OTel spans/metrics | `otel-observability.test.js`; `telemetry.js`; `otel-bootstrap.js` | Development implementation; CI test, no collector integration acceptance yet |
| OTEL-003 — desktop trace context | `RinkClockClient.cs` ActivitySource and traceparent; rink HTTP extraction | Hook implemented; .NET exporter and end-to-end trace verification pending |
| OTEL-007 — local Collector boundary | `otel-bootstrap.js`; `ops/otel/collector.local.yaml` | Local endpoint validation implemented; production deployment review pending |
| OTEL-008/009/010 — sync, alerting, sampling, retention | `requirements/opentelemetry-observability.md` | Planned, not complete |

Requirements in existing `.sdoc`/`.csv` registers remain authoritative where accepted. Names above are feature groups, not replacements for existing requirement IDs.

## Frappe central league migration — active (2026-10-13)

| Requirement | Code / evidence | Current state |
|---|---|---|
| FRAPPE-001 — custom Frappe app | `apps/frappe/icebreaker_league/pyproject.toml`, `hooks.py` | Scaffold committed; Bench install untested |
| FRAPPE-002 — preserve rink authority | ADR-001, unchanged rink Node/.NET code | Architectural boundary accepted |
| FRAPPE-003/004 — stable IDs and admin DocTypes | Six DocType schemas, `model_rules.py`, `frappe-migration-contract.test.js` | Development implementation; Frappe integration tests pending |
| FRAPPE-005 — league-scoped RBAC | System Manager-only schemas | **Not implemented** for multiple league administrators |
| FRAPPE-006 — private data isolation | Fictional admin-only snapshot contract | Partial; full privacy assessment pending |
| FRAPPE-008 — idempotent import | `snapshot_contract.py`, `importer.py`, `export-frappe-admin.js` | Fictional-only M1 pilot; no live data migration |
| FRAPPE-011 — OpenTelemetry | `otel_bootstrap.py`, `observability.py` | Opt-in manual tracing; Collector acceptance pending |
| FRAPPE-009/010/012/013/014/015/017 | Migration requirements and ADR-001 | Planned; not production-ready |

The source-of-truth tracker remains StrictDoc/CSV. This section does not substitute for requirement verification evidence.

## Frappe M2 review addendum — 2026-10-13

The earlier FRAPPE-005 entry above predates the scoped-reader implementation and is superseded **for the read-only API only**. Current evidence:

| Requirement | Implementation evidence | Verification state |
|---|---|---|
| FRAPPE-005 | `access_rules.py`, `access.py`, League Access DocType, `schedule_importer.league_schedule`; `test_access_rules.py`, `frappe-schedule-security.test.js` | Partial: scoped read-only policy tested; real Bench two-tenant RBAC, direct resource/link/export checks outstanding |
| FRAPPE-007 | `schedule_contract.py`, `schedule_importer.py`, `export-frappe-schedule.js`; `frappe-schedule-m2.test.js` | Partial: fictional schedule/DST contract tested; venue timezone and live reconciliation outstanding |
| FRAPPE-011 | `observability.py`, `otel_bootstrap.py`, `test_observability.py` | Partial: allowlisted manual spans; real Collector and privacy acceptance outstanding |
| FRAPPE-015 | `docs/architecture/frappe-migration-runbook.md` | Runbook drafted; no verified Frappe backup/restore or rollback rehearsal |

**Canonical design:** `docs/architecture/frappe-central-league-design.md`. Continue to use the existing StrictDoc/CSV requirement tracker as the source of record; documentation status does not automatically close verification gates.

## Frappe M3 outbound schedule pilot — development evidence

| Requirement | Code and tests | State |
|---|---|---|
| FRAPPE-009 | `rink_schedule_bundle.py`; `rink_schedule_export.py`; `frappe-schedule-verifier.js`; Python `test_rink_schedule_bundle.py`, `test_rink_schedule_export.py`; Node `frappe-signed-schedule.test.js` | **Partial**: fictional signed schedule-only contract and read-only verification. No rules/rosters, release signing service, anti-rollback revision, Bench integration or rink-side apply |
| FRAPPE-005 | Scoped unsigned preview reuses `require_league_reader`; fake Frappe negative tests | **Partial**: live two-tenant Frappe permissions and direct REST/link/export tests still required |
| FRAPPE-011 | Allowlisted `league.rink_bundle_preview` span | **Partial**: local Collector smoke and privacy acceptance pending |

The authoritative requirement tracker is `apps/rink-local/requirements/traceability.csv`. Passing source-level tests does not establish production readiness.

## Frappe M3 revisioned schedule staging — development evidence

The prior M3 table reflects the original v1 signed schedule-only preview. The following **supersedes its anti-rollback statement only**, without closing FRAPPE-009:

| Requirement | New implementation and verification | Remaining acceptance |
|---|---|---|
| FRAPPE-009 | `rink_schedule_bundle.py` v2 signed `release_revision`; `frappe-schedule-verifier.js` v1/v2; isolated `frappe-schedule-staging.js` persistent high-water mark; `stage-frappe-schedule.js` offline CLI; `test_rink_schedule_bundle.py`, `frappe-schedule-antirollback.test.js` | **Partial, source-level only**: no signed roster/rules, KMS release service, tamper-resistant rollback state, approved activation, live Frappe Bench, two-laptop field acceptance |
| FRAPPE-002/012 | Staging cache rejects official rink database files and does not mutate clock/game state | Dual-laptop offline outage and failover tests outstanding |

No production requirement is marked complete based on these tests. The StrictDoc/CSV tracker remains the authoritative register.

## Build and release infrastructure (2026-10-14)

The canonical tracked requirements are [BLD-001–BLD-018](build-infrastructure.md). Implemented verification includes `tools/check_build.py`, `.github/workflows/ci.yml`, committed npm/uv/NuGet locks, Windows RID-specific publish locks, and the manual beta packaging workflow. **Not yet accepted:** fresh-machine Windows validation, production signing/SBOM, live Frappe Bench integration, and a planned .NET support-lifecycle migration.
