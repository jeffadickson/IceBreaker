# IceBreaker mock registration-email demonstration requirements

## Scope

A deterministic offline demonstration must parse a fictional league registration certificate email, compare its claimed participant name with an explicitly selected permanent person record, require a separate exact-name confirmation, and store the attached certificate image in a separate encrypted evidence database for audit. No real mailbox access or actual minor information is authorized.

## Acceptance criteria

- DEMO-001: Generate a fictional league email, fictional person and course, with an embedded mock PNG attachment.
- DEMO-002: Strictly parse a known fake sender, subject and labeled certificate fields. Reject malformed, duplicated, unexpected, oversized or invalid fields and attachment signatures.
- DEMO-003: Preview extracted name, registration number, course, dates and selected person's private legal name without writing any intake or evidence records.
- DEMO-004: Require the operator to select an existing permanent player/adult ID and type the **exact selected legal name** before any commit. Name mismatches must fail even when an operator attempts to confirm.
- DEMO-005: Do not infer identity from email sender, display name, league registration number or certificate image. Ambiguous identities require human reconciliation.
- DEMO-006: After confirmation, store attachment bytes encrypted with AES-256-GCM in a separate SQLite evidence archive, with per-object DEK, wrapped key, integrity digest, opaque ID and access audit.
- DEMO-007: Never store raw email, raw message ID, plaintext certificate image or private names in the central training intake table. The source ID is keyed-HMAC indexed and the central intake references an opaque archive ID.
- DEMO-008: Reprocessing the same email is idempotent; conflicting content for the same source ID is rejected.
- DEMO-009: An imported certificate is **PENDING** and its image **QUARANTINED**. It never automatically satisfies training eligibility.
- DEMO-010: The separate archive must support backend ClamAV scanning; failure remains quarantined, malware detection rejects, and only clean evidence can proceed to explicit human approval.
- DEMO-011: The existing CLI verification command must refuse archive-linked certificate approval without the separate archive path and clean scan state.
- DEMO-012: On central staging failure after a new archive write, attempt compensating deletion with an audit event. Production must add durable reconciliation because SQLite databases are not one distributed transaction.
- DEMO-013: Local evidence archive and mock email files must be Git-ignored. The demo must refuse production mode.
- DEMO-014: Tests must cover name mismatch, incorrect typed confirmation, no pre-confirmation writes, encrypted storage, duplicate handling, quarantine and human verification.

## Out of scope / release gates

A real email connector, MIME parsing, DKIM/SPF authentication, issuer verification, OCR of image text, automatic identity resolution, a production admin confirmation UI, durable cross-database transactions, KMS, and actual mailbox permissions remain separate milestones. Do not upload real registration scans into the development system.
