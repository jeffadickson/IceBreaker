# Frappe M4 pilot — Central training catalog and versioned policies

**Status: development source-level implementation; no production cutover.**

## Decision and ownership

The central Frappe administrative application now models **training course definitions** and **versioned role requirements**. This is the right place for configurable SafeSport, anti-bullying, coaching, manager and volunteer requirements: they are league policies, not fields on an individual player or parent record.

The existing rink-local training ledger remains authoritative for completion, expiration, revocation and game-day eligibility until a protected registration service is deployed. **Frappe does not store certificate scans, player DOB, guardian contact details, or training evidence in these new DocTypes.**

## DocTypes

- **IceBreaker Training Course:** immutable stable ID and course code, title, issuer, description, active flag. System Manager only.
- **IceBreaker Training Policy:** immutable stable ID, course, league, optional season, role, renewal mode, rolling validity days, required flag, effective date range, monotonic revision. System Manager only.

Training policy revisions are append-only; historical policies are not edited or deleted. A later revision for the same course, league, season and role must advance by one and start on a later effective date. A season must belong to the same league. The catalog intentionally supports no general user attachments or participant data.

Renewal modes match the rink catalog: `ONCE`, `ANNUAL_CALENDAR`, `ANNUAL_SEASON` and `ROLLING_DAYS`. A season-specific policy overrides a general league policy for that course and role when effective. An optional policy does not block eligibility; the central API returns the requirement only, **not** a compliance decision for a person.

## Scoped API

`GET /api/method/icebreaker_league.training_api.league_training_policies`

Arguments: `league_id`, optional `season_id`, optional `at_date=YYYY-MM-DD`.

This is a **read-only** projection. The existing `IceBreaker League Admin` role must have an enabled membership for the requested league; no generic DocType access is granted. System Managers can administer the DocTypes through Frappe Desk. The API validates season ownership and returns only allowlisted fields. Requests exceeding 500 policy revisions are rejected rather than silently truncated.

## Required acceptance before using this operationally

1. Install the app in a disposable Frappe v16 Bench and run `bench migrate`; verify the new DocTypes appear and their controllers enforce immutability.
2. With two fictional leagues, test Desk, generic REST, link search, report, export, direct document URLs and the scoped API. League Admin must **not** gain broad DocType rights.
3. Test concurrent revision creation, database uniqueness/locking, and rollback. Pure Python validation is **not sufficient** to prove race-free policy publishing.
4. Reconcile course codes and renewal semantics with the existing Node `training_catalog`, `training_policy_versions` and completion ledger. Define signed policy export to rink before changing eligibility authority.
5. Add tournament ownership DocType and validation before publishing tournament-scoped policies. Current Frappe pilot covers **league** and optional **season** only.
6. Keep protected private training evidence outside Frappe Desk and public file attachments. Complete KMS, MFA, consent, encrypted backups and production security acceptance first.

## Verification

Pure tests (no Frappe installation):

```bash
PYTHONPATH=apps/frappe/icebreaker_league python -m unittest discover -s apps/frappe/icebreaker_league/tests
```

`test_training_policy_rules.py` covers renewal modes, date boundaries, append-only revisions, season overrides and restricted schema fields. `test_training_api.py` uses a fake Frappe runtime for scoped access, cross-league/season denial and privacy allowlisting. Neither is a substitute for live Bench integration.

The rink clock, event journal, signed schedule staging and certified result projection are unchanged by this milestone.


## M4.1 signed policy transport — development contract (2026-10-14)

A **fictional-only**, PII-free, read-only training policy bundle contract now connects Frappe policy definitions to a separate Node verifier:

- `icebreaker_league/training_bundle.py`: canonical JSON, strict policy fields, UTC lifetime (up to 7 days), monotonic release revision, Ed25519 offline signer and verifier.
- `icebreaker_league/training_bundle_export.py`: authenticated league-scoped `preview_unsigned_training_bundle` GET endpoint. Returns a preview-only unsigned bundle with a **placeholder** revision; it does not allocate a release number or sign.
- `apps/rink-local/server/frappe-training-verifier.js`: strict signed-envelope verification, pinned issuer/key/league, expiry and minimum-revision antirollback. It is **read-only** and does not modify rink training, roster, scores, clock or the completion ledger.
- Pure Python and Node tests cover signature tampering, unknown/private fields, wrong league, duplicate policies, invalid renewal rules, expiry, and replay.

### Delivery architecture and remaining gates

```text
Frappe Desk policy administration
       -> authenticated, scoped unsigned preview
       -> [NOT BUILT: controlled publisher / revision ledger / KMS signing]
       -> Ed25519 policy bundle
       -> read-only Node verifier
       -> [NOT BUILT: approved atomic offline staging + parity checks]
       -> protected registration eligibility engine
```

**Do not activate this bundle as rink policy yet.** A signed policy is not evidence that a person completed training. Before cutover: implement an authenticated release publisher with a durable per-league monotonic sequence, key rotation and revocation; independently verify Python/Node canonicalization; perform live v16 Bench tenant tests; map central course IDs to existing local course IDs; stage changes atomically with rollback; validate offline/restart behavior; and obtain explicit league acceptance. The existing rink-local training ledger remains authoritative. This milestone does not close FRAPPE-009 or FRAPPE-013.
