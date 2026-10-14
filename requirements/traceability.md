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
