# IceBreaker League — Frappe v16 custom app

**Status: first development scaffold, not yet deployed or production-ready.**

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

The initial DocTypes are intentionally restricted to **System Manager**. League-scoped administrators, team managers, parents and public visitors must not be granted broader access until tenant permission checks and migration tests exist.

## API and telemetry

Authenticated System Managers can call `/api/method/icebreaker_league.api.league_overview?league_id=...`. The response contains only administrative counts and stable IDs; no player or family PII. OpenTelemetry instrumentation is opt-in, emits only allowlisted operation/status attributes, and must not block Frappe transactions.

## Migration strategy

See [ADR-001](../../../docs/architecture/adr-001-frappe-league-administration.md) and [migration requirements](../../../requirements/frappe-league-migration.md). No production cutover has occurred. The existing rink-local code remains unchanged and authoritative for scoring.

## M2 schedule redevelopment

A strict fictional-only schedule exporter (`apps/rink-local/tools/export-frappe-schedule.js`) and Frappe importer (`icebreaker_league.schedule_importer`) are now present. The importer offers `preview_schedule_snapshot`, POST-only `import_schedule_snapshot`, and `league_schedule`. Only authenticated System Managers may invoke these pilot APIs. It validates source ISO-8601 offset, UTC conversion, DST parity against the league timezone, division/team references and immutable stable IDs. Legacy Final/Live/Scheduled state is carried for display but certified scores and event records are deliberately excluded.

The next gates are a **running Frappe Bench installation**, real permission integration tests, league-scoped administrator roles and dual-read schedule reconciliation. The migration is not yet production-ready; see the [runbook](../../../docs/architecture/frappe-migration-runbook.md).

## Initial league-scoped reader

The restricted `IceBreaker League Access` DocType links a Frappe user to a league. The `IceBreaker League Admin` role has no generic DocType grants; only the read-only `league_schedule` API permits access when an enabled membership matches the requested league. System Managers manage memberships and remain the only users authorized to import schedules. This is an initial fail-closed access boundary, not a completed multi-tenant RBAC implementation; verify it against a running Bench before inviting users.
