# IceBreaker League — Frappe v16 custom app

**Status: M2 development scaffold and fictional schedule pilot, not yet installed in a verified live Bench or production-ready.**

This is the central administrative component of IceBreaker, not the rink-local scoring service. Frappe owns administrative league/season/division/team/game metadata; the rink authority remains the source of official game clock, scoring events and certified results.

## Layout

`icebreaker_league/icebreaker_league/doctype/` contains source-controlled Frappe DocType schemas and validation controllers. `icebreaker_league/observability.py` provides privacy-safe manual OpenTelemetry spans. `icebreaker_league/api.py` contains a permission-gated, read-only API.

## Local Frappe v16 setup

Prerequisites: a working **Frappe v16 Bench** with Python 3.14+, Node 24+ and its supported database/Redis services. This repo does not vendor Frappe or Bench. From a development bench, install the local app package (path must resolve to this directory), then:

```bash
bench --site your-dev-site install-app icebreaker_league
bench --site your-dev-site migrate
bench --site your-dev-site list-apps
```

Use a disposable development site and fictional league data. Standard installation requires the app to be available in the bench `apps/` directory and its Python environment; see Frappe's `bench get-app` and `bench new-app` guidance. The package layout here is scaffolded to that convention but has **not been exercised in a live Bench installation**.

The initial DocTypes are intentionally restricted to **System Manager**. The narrow League Admin role has a scoped **read-only schedule API**, not generic DocType access. Team managers, parents and public visitors must not be granted broader access until tenant permission checks and migration tests exist.

## API and telemetry

Authenticated System Managers can call `/api/method/icebreaker_league.api.league_overview?league_id=...`. The response contains only administrative counts and stable IDs; no player or family PII. OpenTelemetry instrumentation is opt-in, emits only allowlisted operation/status attributes, and must not block Frappe transactions.

## Migration strategy

See [ADR-001](../../../docs/architecture/adr-001-frappe-league-administration.md) and [migration requirements](../../../requirements/frappe-league-migration.md). No production cutover has occurred. The existing rink-local code remains unchanged and authoritative for scoring.

## M2 schedule redevelopment

A strict fictional-only schedule exporter (`apps/rink-local/tools/export-frappe-schedule.js`) and Frappe importer (`icebreaker_league.schedule_importer`) are now present. The importer offers `preview_schedule_snapshot`, POST-only `import_schedule_snapshot`, and `league_schedule`. Only authenticated System Managers may invoke these pilot APIs. It validates source ISO-8601 offset, UTC conversion, DST parity against the league timezone, division/team references and immutable stable IDs. Legacy Final/Live/Scheduled state is carried for display but certified scores and event records are deliberately excluded.

The next gates are a **running Frappe Bench installation**, real permission integration tests for the existing scoped role, venue-timezone parity and dual-read schedule reconciliation. The migration is not yet production-ready; see the [runbook](../../../docs/architecture/frappe-migration-runbook.md).

## Initial league-scoped reader

The restricted `IceBreaker League Access` DocType links a Frappe user to a league. The `IceBreaker League Admin` role has no generic DocType grants; only the read-only `league_schedule` API permits access when an enabled membership matches the requested league. System Managers manage memberships and remain the only users authorized to import schedules. This is an initial fail-closed access boundary, not a completed multi-tenant RBAC implementation; verify it against a running Bench before inviting users.

## Architecture and verification status (M2)

Read the [canonical central-league technical design](../../../docs/architecture/frappe-central-league-design.md) before extending this app. It documents all seven implemented DocTypes, API authorization boundaries, schedule timezone representation, planned M3 signed envelopes, protected family-data boundary and OpenTelemetry policy.

**Current status:** source-controlled Frappe app and unit/contract tests pass; **no live Frappe v16 Bench integration, Desk permission audit, or production migration has been verified**. The IceBreaker League Admin role currently receives a **scoped read-only schedule API**, not general DocType rights. Rink-local scoring and certification remain authoritative.

Next development milestone: disposable Bench install; two-tenant permission tests (including generic REST, link queries, reports and exports); venue timezone/DST parity; and signed M3 contract specification. Do not migrate real minors' data.

## M3 signed certified-result projection (development)

A separate, append-only `IceBreaker Certified Result` DocType and strict Ed25519 envelope validator are implemented in `result_contract.py` and `result_receiver.py`. An authenticated **System Manager** can preview or import a **fictional** signed result through `icebreaker_league.result_receiver.preview_certified_result` and `receive_certified_result` (POST). The receiver validates the pinned issuer/public key, league/game links, replay/idempotency, and sequential revisions. It never modifies the rink clock, journal, or schedule game record.

See [M3 design and key configuration](../../../docs/architecture/frappe-m3-signed-results.md). This is **not** a live production interface: no running Frappe Bench verification, automatic rink-side signer, authenticated service delivery, or cross-tenant integration tests yet. Source-level tests run in CI.

## M3 outbound schedule bundle pilot

A read-only, league-scoped `preview_unsigned_rink_schedule` API produces a **fictional, unsigned** schedule bundle. A strict Ed25519 signing/verification contract and a Node-side read-only verifier now exist for a future offline rink delivery service. **Neither the preview nor the verifier updates the official rink clock or game schedule.** Production signing keys, anti-rollback revisions, actual delivery and approved roster/game-rule bundles are not implemented. See [M3 outbound design](../../../docs/architecture/frappe-m3-rink-schedule-bundle.md).
