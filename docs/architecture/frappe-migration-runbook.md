# IceBreaker Frappe v16 — Development migration runbook

**Scope:** M0/M1 only. This is **not** production deployment guidance. Do not use real player/family data.

## Prerequisites

- A functioning isolated Frappe **v16** Bench with Python 3.14+, Node.js 24+ and the database/Redis versions required by that Frappe release.
- An IceBreaker checkout containing `apps/frappe/icebreaker_league`.
- An IceBreaker demo SQLite database with only the fictional `demo-league`.
- Never mount a live rink database into the Frappe Bench. Work from a disposable demo copy.

## Install app in a development Bench

The IceBreaker monorepo is not itself a Frappe Bench. Frappe must see the app as a Python package under its own `apps/` folder. For a local checkout:

```bash
# In your existing Frappe Bench directory:
ln -s /absolute/path/to/IceBreaker/apps/frappe/icebreaker_league apps/icebreaker_league
./env/bin/pip install -e apps/icebreaker_league
# Add icebreaker_league as a separate line in sites/apps.txt if absent.
bench --site icebreaker-dev.local install-app icebreaker_league
bench --site icebreaker-dev.local migrate
bench --site icebreaker-dev.local list-apps
```

Verify the app is listed and the six IceBreaker DocTypes appear in Desk. If your Bench installation requires a different app installation procedure, follow Frappe's current Bench docs. **No live Bench installation has yet been executed in IceBreaker CI.**

The initial schemas grant access to `System Manager` only. Do not open the app to other roles until tenant isolation tests are complete.

## Export a fictional M1 snapshot

```bash
node apps/rink-local/tools/export-frappe-admin.js --db /absolute/path/to/demo.db > /tmp/icebreaker-admin-demo.json
```

The exporter refuses non-demo leagues. The JSON contains only league, season, division, club and team administration data. It does **not** contain players, birth dates, guardian contacts, training evidence, game events, schedules or certified scores.

## Preview and import

Use an authenticated Frappe **System Manager** session to call:

- `icebreaker_league.importer.preview_admin_snapshot` — counts existing/new records, makes no changes
- `icebreaker_league.importer.import_admin_snapshot` — POST only, inserts missing fictional records; rejects conflicting IDs

Both methods take a `payload` argument containing the snapshot JSON. Do not send these to a public unauthenticated endpoint. Repeating an identical import is idempotent. No Frappe DocType permissions are bypassed.

For v16, use the normal authenticated `/api/method/<dotted.path>` endpoint and follow its CSRF/session or token-auth rules. Do not put API secrets in URLs, logs, or command-line examples.

## OpenTelemetry

For optional, privacy-filtered manual tracing from the Frappe worker, install the app's `observability` optional dependencies and set:

```bash
ICEBREAKER_FRAPPE_OTEL_ENABLED=1
ICEBREAKER_FRAPPE_OTLP_TRACES_URL=http://127.0.0.1:4318/v1/traces
```

Run an OpenTelemetry Collector on the Frappe host or trusted local namespace. Frappe emits only fixed operation and outcome attributes. It does not automatically capture SQL, HTTP payloads or PII. The existing rink OTel Collector design is documented in `requirements/opentelemetry-observability.md`. Logfire remains optional.

## Rollback and next milestone

The old rink and league SQLite services remain intact. To abandon this pilot, disable the Frappe app in the disposable development Bench and discard the test site. No scoring cutover has occurred.

**M2:** Implement game schedule/timezone parity and league-scoped RBAC before importing non-demo leagues. **M3:** signed roster/rules snapshots and idempotent certified-result ingestion. **M4:** separate private registration/vault service and production security acceptance.

## Verification

```bash
node --test apps/rink-local/tests/browser/frappe-migration-contract.test.js
PYTHONPATH=apps/frappe/icebreaker_league python -m unittest discover -s apps/frappe/icebreaker_league/tests
```

These verify the offline schema and fictional-data contract, **not** Frappe Bench installation, DocType migrations, permissions in a running site, or distributed sync.

## M2 schedule pilot — fictional data only

Run this **after** M1 administrative DocTypes are installed and the fictional snapshot is imported. The existing Node/SQLite system remains authoritative. Never point the exporter at a real league database.

```bash
node apps/rink-local/tools/export-frappe-schedule.js --db /absolute/path/to/fictional-demo.db > /tmp/icebreaker-schedule-demo.json
```

In a disposable Frappe Bench with an authenticated **System Manager** account, use `/api/method/icebreaker_league.schedule_importer.preview_schedule_snapshot` and then `/api/method/icebreaker_league.schedule_importer.import_schedule_snapshot` (POST). Supply `league_id=demo-league` and `payload` as the JSON contents of the exported file. Avoid placing snapshots, authentication secrets or private data in URL query strings or logs. Import is idempotent; conflicting stable IDs are rejected without overwriting an existing schedule. A read-only administrative projection is exposed as `icebreaker_league.schedule_importer.league_schedule`.

The M2 contract stores **three time representations**: the source ISO-8601 timestamp with offset, a canonical UTC `Z` timestamp, and a UTC-naive datetime for Frappe's Datetime field. The original source offset must match the league's configured IANA timezone at the instant of play. The importer rejects an invalid offset, DST mismatch, wrong division or team, and any scores, rosters or private fields in the payload. Historical game states are informational; scores and certifications are not migrated.

Verify locally without Frappe:

```bash
node --test apps/rink-local/tests/browser/frappe-schedule-m2.test.js
PYTHONPATH=apps/frappe/icebreaker_league python -m unittest discover -s apps/frappe/icebreaker_league/tests
```

**Not yet validated:** installing and migrating these DocTypes in a live v16 Bench, tenant-scoped league admin permissions, venue-local timezones outside the league timezone, and end-to-end synchronization with a rink laptop. Do not cut over.
