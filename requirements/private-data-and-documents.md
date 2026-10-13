# IceBreaker private registration and document security — requirements v1
Status: implementation target; **development only** until production release gates pass.

## Data and identity
- SEC-001 P0: Each player has a permanent ID; family contacts are separate permanent person records with verified relationship grants. Siblings may share parents without duplicating identities.
- SEC-002 P0: Store legal/preferred names, verified email, phone, postal address, communication preferences, relationship type, verification status, and optional custody/access restrictions. Contact-only records NEVER confer document access.
- SEC-003 P0: Parent login requires a separately provisioned account, a verified relationship to the particular player, and explicit read permissions. The account MUST NOT inherit another adult's access.
- SEC-004 P0: Every sensitive read, verification, grant, revocation, upload and download must be audited without copying PII or file contents into logs.
- SEC-005 P0: Public/game/PA/rink-sync interfaces must contain no birth dates, addresses, contact details, registration identifiers or document contents.

## Encryption and documents
- DOC-001 P0: Encrypt document bytes before persistent storage with AES-256-GCM and random 96-bit nonce, authenticated metadata/AAD, and a unique random 256-bit DEK per document.
- DOC-002 P0: Wrap each DEK using a separate key-encryption key (KEK); store only wrapped DEK, nonce, tags, opaque object ID and metadata. Production KEK comes from a KMS/HSM, not code or the database.
- DOC-003 P0: Document uploads are limited by size and allowlisted MIME types and signatures. Quarantine and malware-scan prior to verification; do not serve active content inline. Never trust client-supplied filenames or paths.
- DOC-004 P0: Download requires fresh server-side authorization, is no-store, and is streamed/decrypted only for an authorized viewer. A guardian sees only their verified children's permitted documents.
- DOC-005 P0: Document verification stores verifier, timestamp, type, and status independently of the scan; season eligibility can reuse verification without downloading original document.
- DOC-006 P0: Document revocation and deletion must be auditable; retention policies, legal holds, and backup purge need a production policy.
- DOC-007 P0: Encrypt sensitive database fields (DOB, legal name, address, guardian contact details) at application layer and/or use SQLCipher/encrypted DB volumes; legacy plaintext must be migrated before production.
- DOC-008 P0: Key absence, authentication-tag failure, or wrong AAD must fail closed. No silent plaintext fallback for encrypted records.
- DOC-009 P0: Never store keys in Git, HTML, local rink SQLite, client bundles, or event feeds. Separate server key privileges from league admin/club accounts.
- DOC-010 P0: Encrypted backups, key rotation, disaster recovery and restore tests are release blockers.

## Access and workflows
- ACL-001 P0: Club registrar may upload and review only documents of players currently authorized to their club.
- ACL-002 P0: League compliance officer may verify age/training documents within league scope, with recorded purpose and decision.
- ACL-003 P0: Parent may upload/view own child's permitted records only after explicit guardian verification; no auto-access from email or surname.
- ACL-004 P0: Timekeepers, coaches, team managers, spectators and central game-event consumers have no document endpoints.
- ACL-005 P0: Former-club access is revoked when affiliation ends; every access rechecks live authorization, never a cached grant.
- ACL-006 P0: Production requires MFA for administrators, invitation/identity verification, consent, rate limiting, TLS, malware scanning, key management, audit retention and privacy/legal review.

## Acceptance
- Ciphertext differs from plaintext; tampering, wrong key, wrong player and wrong document ID fail closed.
- No cross-club/cross-league/cross-family read or upload.
- Duplicate/failed uploads leave no accessible partial objects; no document content appears in the DB or game feeds.
- Verified status survives season rollover; a rejected or revoked verification cannot satisfy eligibility.
- Restart and backup recovery work with keys; without keys sensitive records cannot be decrypted.
- Tests use entirely fictional data and keys.

## Release boundary
A development AES-GCM encrypted document vault and family relationship model are implemented incrementally. A local environment KEK is **not equivalent to KMS**, and existing legacy SQLite private fields are plaintext until a separate verified migration. Do not ingest real minors' documents into the current demo deployment.
