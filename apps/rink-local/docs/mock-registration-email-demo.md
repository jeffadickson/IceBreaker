# Fake League Registration Email Demo

This is a **working, local, fictional-data demo** of the proposed email registration-certificate ingestion workflow. It does not access Gmail, Outlook, IMAP, or real email accounts.

## Demonstration

The script creates a fictional league player **Alex Example**, a mock certificate email from `certificates@fictional-foothills.example.invalid`, and a tiny fictional PNG attachment. No sensitive real-world data is needed.

Use Node.js with the repository's supported SQLite runtime. Set two different random 32-byte base64 environment secrets before importing:

- `ICEBREAKER_DOCUMENT_KEK_BASE64` for the encrypted evidence archive
- `ICEBREAKER_INGEST_HMAC_KEY_BASE64` for stable duplicate detection without retaining raw email message IDs

Generate each key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and set it in your local environment. Never commit the keys to Git or rotate them without a planned migration.

From the repository root:

```bash
# Creates fictional player, training catalog entry, and JSON mock email.
node apps/rink-local/server/demo-registration-email.js setup --workspace /tmp/icebreaker-email-demo

# Parses the email and shows the selected player's legal name.
# Does not write intake or image records.
node apps/rink-local/server/demo-registration-email.js preview --workspace /tmp/icebreaker-email-demo

# Interactive terminal only: type "Alex Example" exactly to confirm identity.
node apps/rink-local/server/demo-registration-email.js import --workspace /tmp/icebreaker-email-demo
```

On Windows, choose a workspace such as `C:\\temp\\icebreaker-email-demo`. The demo creates `demo-identity.json` with the fictional player's permanent ID. A real importer would require authorized identity selection, never name-only matching.

## Confirmation boundary

The preview compares the email's **Participant Name** against the selected player's **private legal name**. It rejects mismatches. Even for matching names, the operator must type the selected legal name exactly before any intake or evidence writes occur. Confirmation is not issuer verification: the resulting record remains `PENDING`.

A sample preview resembles:

```json
{
  "claimedName": "Alex Example",
  "selectedLegalName": "Alex Example",
  "nameMatches": true,
  "registrationNumber": "FAKE-2026-0001",
  "course": "LEAGUE_ORIENTATION",
  "attachmentMime": "image/png"
}
```

## Separate encrypted evidence database

The demo writes the PNG **only after name confirmation** to `encrypted-email-evidence.db`, a separate SQLite database from `league.db`. It stores AES-256-GCM encrypted attachment bytes under a unique per-object DEK, itself wrapped by the configured document KEK. The archive includes a SHA-256 checksum, keyed source fingerprint, opaque evidence ID, encrypted bytes, quarantine state, and a separate `evidence_audit` table.

The league database contains only `archive:<opaque evidence ID>` as the training intake's evidence reference. It does **not** store the raw email, plaintext attachment, email message ID, or registration number. Reprocessing the same email is idempotent; conflicting content for the same source is rejected. If central intake staging fails after a new archive write, the demo removes that new archive object and records a discard event.

**Do not store certificates or other personal documents in Git.** The archive and local keys must be outside the repository and protected by filesystem permissions and encrypted backups.

## Malware and human verification

The attachment is initially `QUARANTINED`. The archive supports a backend-only ClamAV scan method; a scanner error leaves it quarantined and malware detection rejects it. The ordinary CLI `verify` command refuses to approve an archive-linked intake until its archive entry has a `CLEAN` scan state. In tests, the scanner is mocked; real ClamAV deployment remains a prerequisite for processing actual documents.

To scan quarantined demo evidence using a **real local ClamAV service**, configure `ICEBREAKER_CLAMAV_SOCKET` and run:

```bash
node apps/rink-local/server/scan-email-evidence.js \
  --archive /tmp/icebreaker-email-demo/encrypted-email-evidence.db
```

If ClamAV is unavailable, the evidence remains quarantined. This demo does not provide a command-line `--clean` override.

After a clean scan and independent registrar verification of the issuer, certificate, and person, the existing admin CLI may approve it using the separate archive path:

```bash
node apps/rink-local/server/icebreaker-admin.js verify \
  --db /tmp/icebreaker-email-demo/league.db \
  --archive /tmp/icebreaker-email-demo/encrypted-email-evidence.db \
  --intake INTAKE_UUID --actor registrar-id \
  --note "Independently verified with issuer" --attest-reviewed
```

The demo intentionally does **not** provide a UI shortcut to mark the scanner result clean or automatically verify the certificate.

## Threats and limitations

- This parser accepts a deliberately narrow **fictional JSON email format**, not arbitrary MIME or forwarded messages. Sender and subject text are mock fixtures, not proof of authenticity.
- A human must select the permanent person ID. Matching legal names alone does not establish identity; same-name ambiguity and cross-club scope must be resolved by a production registrar workflow.
- The evidence archive uses local environment keys, not KMS. Production authorization, MFA, guardian consent, retention, backups, malware-scanner deployment, and independent security review remain outstanding.
- The two SQLite databases are separate; a compensating discard handles the ordinary archive-then-intake failure path, but there is no distributed transaction. Production needs reconciliation of orphaned evidence and durable jobs.
- The existing CLI is offline development-only and rejects `ICEBREAKER_PRODUCTION_MODE=1`.

## Tests

```bash
node --test apps/rink-local/tests/browser/mock-registration-email.test.js
```

Tests cover no writes on preview or name mismatch, encrypted PNG in a separate DB, pending intake, idempotent re-import, quarantine enforcement, scanner failure, and subsequent explicit verification after a mocked clean scan.
