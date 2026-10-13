# Proposed next architectural refactor (not yet completed)

## Integration milestone 1 — completed synthetic baseline

- [x] Document SQLite schema definitions across league/rink, central ingest, encrypted evidence and C# desktop; provide read-only introspection tooling for exact columns, indexes and foreign keys.
- [x] Simulate an eight-team, 120-player, 56-game double round-robin season and reconcile certified standings, skater statistics and split goalie totals.
- [x] Test suspension, training, confirmed lineups, late disciplinary changes and recovery.
- [x] Test one complete game from manager lineup through timekeeper events, goalie changes, referee signature and certified league publication.
- [ ] Extend the large simulation to concurrent rink stations, network partition/reconnection, distributed replay and certification amendment conflicts.
- [ ] Run physical desktop/hardware acceptance and production security reviews.

See [schema reference](apps/rink-local/docs/database-schemas.md) and [integration simulation](apps/rink-local/docs/full-league-integration-simulation.md).


The current prototype is intentionally kept intact under `apps/rink-local/` so that its relative source/test paths work. Refactor **in tested PRs** toward:

```text
apps/
  rink-console/       Avalonia touch scorekeeper / local operator UX
  league-web/         Parent tracker, leagues, teams, standings, schedules
  league-api/         Authenticated central API
  arena-gateway/      Scoreboard/PA/horn hardware
services/
  ingest/             Remote station synchronization, leases, auth
  certification/      Elsa workflows, officials, immutable signatures
  notifications/      Parent opt-in email, templates, dedup delivery
src/
  IceBreaker.Core/    Sport-neutral platform and event contracts
  IceBreaker.Hockey/  Hockey clock/penalty/scoring rules
  IceBreaker.Persistence/
  IceBreaker.Contracts/
tests/
  unit/ integration/ e2e/ recovery/ security/
docs/site/            Published HTML operator/parent/developer manuals
requirements/         StrictDoc and traceability
```

**Do not move current backend files without rerunning existing tests**; current code imports paths relative to `apps/rink-local`.

## TODO — Production email registration/certificate ingestion

The fictional league-email parser, interactive name confirmation, pending training intake, and separate encrypted evidence archive are implemented as a development demo. The following are **not implemented** and should be completed in small, independently tested milestones:

- [ ] **Mail connectors:** Implement read-only Gmail and Microsoft Outlook/Microsoft Graph adapters, followed by optional IMAP support. Use least-privilege OAuth where supported, narrowly scoped inbox searches, explicit operator consent, and idempotent provider message IDs.
- [ ] **Robust extraction:** Parse real RFC 5322/MIME messages, multipart attachments and common PDF/image certificates in a sandbox. Apply strict attachment limits, content-type/signature validation, malware scanning and untrusted-content handling.
- [ ] **Issuer and certificate verification:** Establish an allowlisted provider registry, validate sender authentication (including DKIM/DMARC where available), verify certificate/registration identifiers with issuers where possible, and never treat sender identity alone as proof.
- [ ] **Identity confirmation UX:** Provide a secure registrar review screen displaying the parsed name and selected permanent person record side by side; require explicit confirmation, resolve duplicate/similar names manually, and prohibit automatic merges.
- [ ] **Secure evidence and audit:** Use the separate encrypted evidence archive (not Git) with scoped access, malware quarantine, tamper-evident audit events, retention/deletion policies, encrypted backups, KMS integration and disaster-recovery tests.
- [ ] **Approval workflow:** Keep email-derived records PENDING until authorized registrar verification. Add rejection/retry/reconciliation queues and verify that unapproved records never affect roster or training eligibility.
- [ ] **End-to-end validation:** Test synthetic Gmail/Outlook/IMAP messages, duplicate delivery, malformed attachments, forged sender headers, name mismatch, wrong-person selection, interrupted imports, expired certificates and revocation. Keep production ingestion disabled until the security release gates are met.

See [mock registration email demo](apps/rink-local/docs/mock-registration-email-demo.md), [backend CLI intake guide](apps/rink-local/docs/backend-cli-training-intake.md), and [private data security requirements](requirements/private-data-and-documents.md).
