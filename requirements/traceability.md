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
