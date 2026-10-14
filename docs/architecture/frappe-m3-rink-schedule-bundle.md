# M3 — Frappe-to-rink signed schedule bundle pilot

**Status:** Source-level development only. No production signing, no live Frappe Bench installation, no schedule import into rink authority.

## Ownership and data flow

Frappe is the planned central administrative source for schedules. The Windows rink authority remains the only source for live time, scores, events, referee certification and the official game journal. A central outage must never interrupt game operations.

```text
Frappe Desk / scoped league admin
       |
       v
read-only league schedule projection (unsigned preview)
       |
       v
future protected release service + KMS signing key
       |
       v
Ed25519 signed bundle -> offline delivery -> rink-side verification
                                            |
                                            v
                              future atomic staging + acceptance
                                            |
                                            v
                               local schedule cache (not clock)
```

The implemented preview returns `preview_only: true` and `signed: false`; it must never be accepted as a rink-authoritative release. The verifier only validates a signed payload and returns its digest/count. It does not update SQLite or change the current game.

## Bundle contract v1

Strict top-level keys: `schema_version`, `fictional`, `league_id`, `issued_at`, `expires_at`, `issuer`, `key_id`, `games`, `signature`. Each game includes only `game_id`, `division_id`, `home_team_id`, `away_team_id`, `scheduled_utc`, and `schedule_status`. All IDs are opaque. The contract rejects unexpected fields, player identifiers, names, dates of birth, addresses, game scores, signatures on altered payloads, duplicate/unsorted games and invalid UTC.

The signature is Ed25519 over canonical ASCII JSON of the unsigned keys, recursively sorted and compactly encoded. Trusted public keys must be pinned to an issuer and an explicit allowed league list. Validity is at most seven days. Verification rejects expired or excessively future-dated bundles.

This **does not provide anti-rollback** against a previously signed still-valid bundle. Before production, implement a monotonic release revision and persisted highest-accepted revision on each rink device, with a separately authorized rollback workflow. Signing keys must live in a KMS/HSM-backed release service, never the Frappe browser or rink client.

## Implemented code

- `apps/frappe/icebreaker_league/icebreaker_league/rink_schedule_bundle.py` — pure validation, offline test signing and verification.
- `apps/frappe/icebreaker_league/icebreaker_league/rink_schedule_export.py` — read-only, league-scoped Frappe preview; fictional demo league only.
- `apps/rink-local/server/frappe-schedule-verifier.js` — Node read-only verification for future staging.
- `apps/frappe/icebreaker_league/tests/test_rink_schedule_bundle.py`, `test_rink_schedule_export.py`, and `apps/rink-local/tests/browser/frappe-signed-schedule.test.js` — contract and authorization negative tests.

The Frappe API is:

`/api/method/icebreaker_league.rink_schedule_export.preview_unsigned_rink_schedule?league_id=demo-league`

It requires an authenticated System Manager or a scoped `IceBreaker League Admin` membership. The endpoint is read-only and excludes private player and guardian information.

## OpenTelemetry

The preview uses the allowlisted `league.rink_bundle_preview` span with a fixed operation/outcome only. Do not attach league IDs, team IDs, signing keys, request bodies, private records, or document digests to telemetry. The optional local OTLP Collector remains the export boundary; Logfire is a possible downstream viewer, not a mandatory application dependency.

## Acceptance gates before live deployment

1. Install and migrate the app in a disposable Frappe v16 Bench and test two fictional leagues, generic REST and scoped API permissions.
2. Confirm Frappe schedule/timezone parity against the old system, including venue-local timezones and DST.
3. Implement a separately authenticated release service and KMS-backed signing, signed revision sequence, key rotation/revocation and release audit.
4. Implement rink-side verification, anti-rollback storage, atomic staging, conflict handling and offline fallback **without changing the official clock**.
5. Extend the bundle to approved roster IDs and versioned game rules, with no DOB/address/contact information.
6. Exercise primary/backup laptop, central outage, stale bundle, tampered bundle, and recovery scenarios.
7. Pass production privacy/security gates and an explicit approved cutover.

## Development verification

```bash
PYTHONPATH=apps/frappe/icebreaker_league python -m unittest discover -s apps/frappe/icebreaker_league/tests
node --test apps/rink-local/tests/browser/frappe-signed-schedule.test.js
```

These tests do not substitute for a running Frappe Bench or field tests.
