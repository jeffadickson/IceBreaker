# IceBreaker private registration and encrypted document architecture
Version 0.1 · Development implementation and production gap analysis

## Trust boundaries
1. **Rink authority:** official game clock, roster eligibility booleans, event journal. No document storage, PII, or private keys. Game sync emits only approved roster identifiers and event data.
2. **Central registration service:** authenticates league registrars and club staff. Enforces live club/league scope on every private operation. Does not trust a client-provided club ID.
3. **Family service:** independent parent login and per-child verified guardian grant. Contact links alone do not grant document access. A revoked grant takes effect on the next request.
4. **Family profile details:** permanent adult identity, email/phone, preferred name, mailing address, and email/SMS preferences. Related-person contacts are encrypted on new writes when the private-field key is configured; family account login email remains an indexed plaintext field in this development implementation and requires migration before production.
5. **Encrypted vault:** opaque random document object names, AES-256-GCM with per-document DEKs. KEK wraps each DEK with authenticated AAD bound to the document ID. Document encryption AAD binds ID, player ID, and document type.
6. **Key service:** development uses `ICEBREAKER_DOCUMENT_KEK_BASE64` (32 random bytes, base64). Production must replace this with KMS/HSM, key versioning, rotation and recovery. `ICEBREAKER_PRIVATE_FIELD_KEY_BASE64` optionally encrypts newly written legal names, DOB, addresses, and related-person contact fields; legacy plaintext must be migrated.

## Data model
- `players`: stable public-safe UUID and approved display name
- `player_private_profiles`: legal name, DOB, address (encrypted on new writes when field key configured)
- `player_related_people` + `player_person_links`: permanent contacts, relationships; no implicit authority
- `family_accounts`: separately provisioned adult login; email index and password hash
- `family_grants`: player/person, explicit view/upload permissions, verifier, verification time and revocation
- `private_documents`: player ID, type, MIME, length, SHA-256, encrypted DEK, AES-GCM nonces/tags, status and audit
- `league_audit`: sensitive reads, uploads, grants and decisions without document bytes or PII

## Upload lifecycle
1. Authenticated club registrar or verified guardian submits a bounded base64-encoded PDF, PNG or JPEG (development cap: 1 MiB). The server validates declared MIME and magic bytes, rejects path/filename handling and oversized payloads.
2. Generate random 256-bit DEK and 96-bit GCM nonce; encrypt the bytes with player/document-bound AAD. Encrypt the DEK with the KEK and distinct AAD. Write ciphertext to an exclusive private file (mode 0600), then commit metadata/audit to SQLite; remove file if the database commit fails.
3. Mark `QUARANTINED`. The development build deliberately has **no public scanner bypass**. An isolated trusted malware-scanning service must attest a clean result before `PENDING`; until then, viewing and verification are blocked.
4. A league compliance reviewer verifies or rejects a scanned document. A verified result can be reused next season without downloading the scan, subject to league validity rules.
5. On every download, recheck club membership or the verified guardian grant, check document status, unwrap the DEK, authenticate/decrypt bytes and audit the read. Do not expose a direct object URL.

## Family permissions
An adult is a distinct `person_id` and `family_account`. One adult can have grants for multiple siblings; each grant can be independently revoked. Two parents can have different permissions. A contact relationship alone never authorizes a login. Development league admins can attest and provision grants; **this is not a substitute for verified identity, custody/guardianship evidence or consent**.

## Threats and mitigations
| Threat | Mitigation | Gap |
|---|---|---|
| Stolen encrypted object | Per-file AEAD + wrapped DEK | KMS required |
| Tampering or object swapping | GCM tag + ID/player/type AAD + digest | Key rotation required |
| Cross-club/family access | Live scoped authorization | Independent pen test required |
| Malicious PDF | Quarantine and type/size checks | Scanner/CDR not integrated |
| Compromised database host | Field encryption on opt-in new writes | SQLCipher/migration, encrypted backups |
| Compromised key env/host | Distinct keys; no keys in DB | KMS/HSM, isolation, key lifecycle |
| Stale parent custody rights | Per-player revocable grants | Verified legal process required |
| Credential theft | Scrypt passwords, hashed expiring tokens | MFA, rate limits, invitations, recovery |
| Sensitive data in logs | PII-free audit payloads | Full logging/privacy review |
| Lost/corrupted documents | Authenticated encryption | Encrypted backups and restore drills |

## Release gates
No production ingestion of real minors' information until: scanner/CDR, KMS integration, database encryption and legacy migration, guardian verification/consent, MFA, account recovery, access audit retention, secure upload streaming, encrypted backup restore, retention/deletion/legal hold policy, and independent security testing. A local development environment key and successful unit tests do not satisfy these gates.

## Verification
`node --test apps/rink-local/tests/browser/private-documents.test.js` and `npm test`.

## Local development setup (fictional documents only)

Set two **different** random 32-byte base64 secrets in the backend environment, for example generate with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` twice. Assign one to `ICEBREAKER_DOCUMENT_KEK_BASE64` and the other to `ICEBREAKER_PRIVATE_FIELD_KEY_BASE64`. Store them outside the repository. Never rotate by simply overwriting these values without rewrapping/re-encrypting the existing records. The field key only protects **new or updated** records; it does not migrate historical plaintext. Existing family-account login email and registration account emails remain plaintext indexes in the current development database.

The club/league portal is `/registration.html` and the separate guardian portal is `/family-registration.html`. A league administrator provisions a family account and explicitly verifies a per-child grant after independent identity/authority checks. The parent can update their own contact details, mailing address, and notification preferences and upload a fictional test PDF/PNG/JPEG. Uploads remain `QUARANTINED`; there is no web endpoint to mark a file scanner-clean. In development tests, the scanner boundary is exercised directly using a trusted internal call, not through a parent or admin HTTP request.

**Production is intentionally disabled** when `ICEBREAKER_PRODUCTION_MODE=1`; the registration service fails to start until the missing release controls are implemented. The rink-local SQLite database is still shared with the demo game service. The production design must move registration and vault metadata to a separately secured central service.
