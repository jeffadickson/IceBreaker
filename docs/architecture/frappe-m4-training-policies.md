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

## M4.2 signed policy staging — development increment (2026-10-14)

A **separate persistent SQLite cache** now stages authenticated training policy bundles without changing the authoritative rink game database or training evidence ledger.

- `apps/rink-local/server/frappe-training-staging.js` verifies the entire Ed25519 envelope, league/key pinning, expiry, field allowlist, sorted policy entries and release revision before writing.
- It atomically stores the policy-only JSON and a per-league high-water revision. Exact duplicate replay is idempotent; older releases and same-revision conflicting payloads are rejected.
- `openTrainingStagingDatabase` refuses a rink game database or private registration database, and refuses an existing symlink database.
- `apps/rink-local/server/stage-frappe-training.js` provides a bounded offline CLI. It refuses production mode and requires a separately pinned trust file.
- `apps/rink-local/tests/browser/frappe-training-staging.test.js` exercises signature failures, PII rejection, cross-league denial, expiry, replay/rollback, restart persistence, cache isolation and the CLI production guard.

### Fictional offline demonstration

Obtain a **signed fictional** training-policy bundle from a trusted offline development signer (the Frappe preview endpoint is unsigned and cannot be staged). Pin the signer's Ed25519 public key to the expected issuer and league in a separate JSON trust file, then run:

```bash
node apps/rink-local/server/stage-frappe-training.js \
  --staging-db /tmp/icebreaker-training-cache.db \
  --bundle /tmp/fictional-signed-training.json \
  --trust /tmp/fictional-training-public-keys.json \
  --league demo-league
```

The output reports `staged` or `duplicate`, league, revision and policy count. It does **not** report participant completion, eligibility, or change a game. The cache is intentionally not connected to the local training evaluator.

### Remaining acceptance gates

**FRAPPE-018 remains PARTIAL.** A controlled publisher with durable per-league revision allocation, private-key isolation/KMS and authenticated delivery is still missing. Also required: live v16 Bench installation and permission tests, cross-language fixture parity, central-to-local course ID mapping, offline parity/reconciliation reports, approved activation and rollback strategy, secure production storage, and dual-laptop failure injection. A cache high-water mark can itself be rolled back by restoring an older file; production requires tamper-resistant release state.

## M4.3 read-only policy parity (2026-10-14)

`apps/rink-local/server/frappe-training-parity.js` now compares the **latest staged** central policy definitions against local `training_policy_versions` for a selected league, season and date. It requires an explicit, one-to-one mapping of central course IDs to local course IDs and reports missing courses, mismatched renewal/required/revision/effective dates, and missing local or central policies. It does not infer identities from titles or change any policy, roster, training completion or official clock.

`apps/rink-local/tests/browser/frappe-training-parity.test.js` uses fictional local tables to verify exact match, mismatch, unmapped courses, duplicate mapping rejection, wrong league, expired staging and read-only behavior. This is a **library API for development reconciliation**, not an approved activation path. A production cutover still requires operator-reviewed mapping, signed publisher, live Frappe Bench parity, service authentication and an explicit policy activation mechanism with rollback.

### Read-only parity CLI

After staging a fictional signed policy release, create an explicitly reviewed JSON course map such as:

```json
{"central-safesport-id": "local-safesport-uuid"}
```

Compare it to a **separate fictional rink database**:

```bash
node apps/rink-local/server/compare-frappe-training.js \
  --staging-db /tmp/icebreaker-training-cache.db \
  --local-db /tmp/fictional-rink.db \
  --course-map /tmp/reviewed-course-map.json \
  --league demo-league --season demo-2026 --date 2026-10-14
```

The CLI opens both databases read-only. It returns `match` (exit 0), `mismatch` (exit 2), or an invalid/unsafe request error (exit 1). This is an operator-visible **comparison report**, not automatic migration or proof of live Bench equivalence. Course mappings are never guessed from similar titles.


## M4.4 offline training-policy publisher (2026-10-14)

The **fictional-only** release publisher is implemented in `icebreaker_league/training_publisher.py` with an offline command-line wrapper `icebreaker_league/publish_training_cli.py`. This closes the *development* gap between an unsigned Frappe training preview and a signed bundle that the existing Node verifier and staging cache can consume.

The publisher operates **outside Frappe web workers**, with an Ed25519 seed in a separately permission-restricted local file. It accepts only the exact `preview_unsigned_training_bundle` response for `demo-league`; it validates the preview SHA-256, schema, fictional flag, release placeholder, policy count, freshness (within one hour), and expiration. The caller must provide a named reviewer and change ticket. These are development attestations, **not authenticated approval or KMS authorization**.

A separate SQLite release ledger allocates per-league revisions under `BEGIN IMMEDIATE`, records the signed envelope and change ticket, and returns the identical envelope for an unchanged unexpired release. A changed policy or an expired release receives the next revision. The CLI writes the signed output using an atomic file replacement; a crash after database commit can be recovered by retrying the same preview before expiration. The ledger never stores people, evidence, birth dates, scores, or the signing seed.

### Fictional release demonstration

1. Obtain a recent unsigned JSON response from Frappe's **read-only** `preview_unsigned_training_bundle` API in a disposable Bench. Save it to `/tmp/training-preview.json`. The preview is untrusted input until reviewed.
2. Generate a random Ed25519 private seed **outside the repo** and store 64 hexadecimal characters in a file readable only by the publishing service account (`chmod 600` on Unix). Pin the matching public key in the existing Node training trust configuration. Never pass the seed in command arguments or commit it.
3. With `PYTHONPATH=apps/frappe/icebreaker_league`, run:

```bash
python -m icebreaker_league.publish_training_cli \
  --preview /tmp/training-preview.json \
  --state-db /tmp/icebreaker-release-ledger.sqlite \
  --key-file /secure/dev-ed25519-seed.hex \
  --output /tmp/fictional-signed-training.json \
  --approved-by fictional-reviewer --approval-ticket DEV-123
```

4. Stage the output using `node apps/rink-local/server/stage-frappe-training.js` and compare against local policy using `compare-frappe-training.js`. Neither command activates a policy or touches the game clock.
5. Re-run publication with the same preview; expect `duplicate` and the same signed envelope. Change the approved policy in Frappe, generate a new preview and publish again; expect a higher release revision. Verify that staging rejects older releases.

### Security boundaries and outstanding work

- The CLI refuses `ICEBREAKER_PRODUCTION_MODE=1`, insecure key-file permissions, symlink input, and using a rink/private database as its ledger.
- The release ledger is local and **not tamper-resistant**; a stolen/rolled-back ledger could reuse a revision. Production needs durable protected release state and an independent high-water/antirollback authority.
- Reviewer name and ticket are **unverified assertions**. Production requires authenticated dual-control approval, issuer-specific KMS/HSM signing, key rotation/revocation, protected artifact delivery and external audit retention.
- No running Frappe v16 Bench or real MariaDB permissions/concurrency acceptance is claimed. No real minors' data or live eligibility activation is authorized.
- The release publisher is for **training policies only**; roster/rules and certified-result production signers remain separate milestones.

Tests: `PYTHONPATH=apps/frappe/icebreaker_league python -m unittest apps.fr... ` is not a supported dotted test path in every environment; use `python -m unittest discover -s apps/frappe/icebreaker_league/tests` with the above PYTHONPATH instead.
