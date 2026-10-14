# IceBreaker beta acceptance and release decision

**Current decision: NO-GO until field evidence is recorded.** The rink-only fictional-data simulation is the next executable milestone. A passing GitHub Actions run does not prove that two laptops, an arena scoreboard, a referee's phone, or a real Frappe Bench behave correctly.

## Beta profiles

| Profile | Purpose | Required gates |
|---|---|---|
| `rink-simulation` | Two laptops, complete fictional game, paper reconciliation | 6 |
| `supervised-beta` | Approved, supervised rink trial with paper fallback | 11 (includes simulation) |
| `frappe-beta` | Disposable Frappe v16 Bench and two fictional leagues | 6 |
| `production` | Live operations and real protected registration data | 17 (includes supervised beta) |

The machine-readable source of truth is [beta-acceptance-gates.json](../../requirements/beta-acceptance-gates.json). This release gate is **separate from the existing StrictDoc tracker**. It does not replace stable requirements IDs or verification traceability; it records executed acceptance evidence for specific builds.

## How to run the readiness report

From a checkout of the **exact** commit under test:

```bash
node apps/rink-local/tools/beta-readiness.js \
  --profile rink-simulation --revision "$(git rev-parse HEAD)"
```

With no field evidence, the result is `NO_GO`. This is intentional. After the team completes the checklist, record one evidence entry per gate in a JSON file (for example `evidence/beta-rink-001.json`):

```json
[
  {
    "id": "SIM-01",
    "result": "PASS",
    "revision": "REPLACE_WITH_FULL_TESTED_GIT_SHA",
    "reviewer": "Fictional QA Reviewer",
    "executedAt": "2026-10-14T20:00:00Z",
    "artifact": "evidence/desktop-install-and-launch-log.txt"
  }
]
```

The example is **not real evidence**. Artifact paths must point to existing files inside the checkout. Do not store minors' information, credentials, or actual birth certificates in Git. Store sensitive acceptance artifacts in a secured evidence system and reference only non-sensitive, redacted summaries in this report.

```bash
node apps/rink-local/tools/beta-readiness.js \
  --profile rink-simulation --revision "$(git rev-parse HEAD)" \
  --evidence evidence/beta-rink-001.json --strict
```

Exit code 2 means required evidence is missing or invalid. Exit code 1 means malformed input. An `EVIDENCE_RECORDED` result means the entries passed mechanical validation **only**; a named release authority still needs to inspect the actual logs, verify the signoffs and decide whether the beta is permitted.

## Proposed full-game acceptance sequence

Run on two physical Windows laptops with an isolated test league, approved fictional rosters, one referee phone, and an independent paper scoresheet.

1. Install the exact Windows artifact on both laptops. Verify the official clock starts/stops, retains correct period time, and never depends on the UI window.
2. Enter a multi-period game with unassisted and assisted goals, penalties (including overlapping penalties), goalie changes, empty net, shots and corrections. Compare every event with the independent paper log.
3. Close the native window during live play, restart it, and verify clock authority and event state are unaffected. Simulate a primary-laptop failure, restore to the backup and check no event duplicates or revision rollback.
4. Test referee correction requests, new scoresheet revision, re-review and final certification. Check that an old revision cannot be signed after changes.
5. Exercise network loss and restoration, scoreboard/PA connections, and any peripheral equipment. Observe that Frappe and OpenTelemetry outages never control the rink clock.
6. Record event reconciliation counts, observed failures, screenshots without private data, timings, software commit, operating system versions, operator, reviewer and remediation issues.

Do not conduct a live official game without explicit league permission, a trained operator, a tested paper fallback and a supervisor authorized to abort the beta.

## Frappe beta gates

Use a **disposable Frappe v16 Bench** with fictional league data. Verify installation and migrations; two-tenant Desk, REST, link, report and export permissions; schedule timezone/DST parity including out-of-area venues; signed schedule/result round-trip; training policy parity and rollback; and Frappe/OTel outage isolation. Pure Python tests and offline signed bundles do **not** close these gates.

Follow [Frappe migration runbook](../architecture/frappe-migration-runbook.md). The existing Node/SQLite system remains authoritative until an explicitly approved cutover.

## Production restrictions

The production profile is not a substitute for an independent security or legal review. Do not ingest real minors' personal information into the development service. Production requires managed encryption keys, complete legacy-data migration, consent and custody verification, administrator MFA and recovery, malware scanner deployment, tested encrypted backups, secure service/device identities, audit integrity and operational incident response.

## Open items and owners

- **Operations/QA:** run first complete two-laptop fictional game, file issues for all deviations.
- **Desktop:** validate touch and keyboard performance on 1366×768 Windows laptop and verify modal correction flow.
- **Frappe:** install pinned v16 Bench and execute two-tenant permission and timezone matrix.
- **Security:** complete production private-data isolation and device/operator authentication.
- **Release owner:** review evidence and record an explicit go/no-go decision; do not infer it from CI.
