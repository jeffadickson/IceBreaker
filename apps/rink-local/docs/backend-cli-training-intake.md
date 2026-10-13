# IceBreaker Backend CLI — Training Certificate Intake

## Purpose

Provide a stable, scriptable backend interface for future registration-certificate email processing, batch imports, and external verification services. The parser produces **structured metadata**, not direct database writes. The CLI accepts a certificate claim as **PENDING**; it does not infer identity or certification from an email sender, subject, attachment filename, or certificate image.

**Development/offline use only.** Run under a restricted backend OS service account with access to the SQLite database. This is not a public API or a production authorization boundary. Do not process real minors' data until the production security controls are completed.

## Data model

The new `training_intake` table stores a durable intake ID, source type, **keyed HMAC** of the source ID (not the email Message-ID itself), training ID, permanent participant ID, completion/expiration dates, optional secure document reference, state, import actor, review actor/time, review note and eventual verified completion ID.

States: `PENDING` → `VERIFIED` or `REJECTED`. Only `VERIFIED` creates a record in `training_completions_v2` and affects eligibility. Repeating the same source ID with identical metadata is idempotent; conflicting metadata is rejected. A revoked certificate can be handled using the existing training-completion revocation process.

## Environment

Generate a random 32-byte key once:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Set `ICEBREAKER_INGEST_HMAC_KEY_BASE64` in the backend environment, not Git or command-line arguments. Keep the key stable across restarts; rotating it without a migration would break duplicate detection. This is separate from the document encryption and private-field keys.

The database must already exist and have been initialized by IceBreaker. The CLI does not silently create a new league database.

## Example certificate metadata

A future email processor can emit the following JSON file:

```json
{
  "sourceType": "EMAIL",
  "sourceId": "fictional-message-id-123",
  "trainingCode": "SAFESPORT",
  "subjectType": "ADULT",
  "subjectId": "verified-permanent-person-uuid",
  "completedOn": "2026-10-01",
  "expiresOn": "2027-09-30",
  "evidenceRef": "opaque-encrypted-document-reference",
  "verification": "REVIEW_REQUIRED"
}
```

The source ID must be stable and unique within the ingest source. The `subjectId` must already be a known permanent player/adult ID; the CLI deliberately refuses to match people by name or email address. `trainingCode` can be replaced by `trainingId`. The evidence reference is an opaque identifier for separately authorized encrypted storage, **not a local file path or an email attachment**. No raw email, contact information, certificate scans, or plaintext message identifiers are stored in the intake table.

## Commands

All commands are run from the repository root. Replace the example database and identities with **fictional test data**.

```bash
CLI=apps/rink-local/server/icebreaker-admin.js
DB=/absolute/path/to/league.db

# Discover configured training courses and their IDs.
node "$CLI" catalog --db "$DB"

# Stage a certificate for human verification (default).
node "$CLI" ingest --db "$DB" --json certificate.json --actor email-importer

# Also accepts metadata JSON from standard input.
cat certificate.json | node "$CLI" ingest --db "$DB" --json - --actor email-importer

# List the verification queue.
node "$CLI" pending --db "$DB" --state PENDING

# Approve only AFTER checking the original certificate and participant identity.
node "$CLI" verify --db "$DB" --intake INTAKE_UUID --actor registrar-id \
  --note "Checked original issuer certificate" --attest-reviewed

# Or reject with an audit reason.
node "$CLI" reject --db "$DB" --intake INTAKE_UUID --actor registrar-id \
  --note "Certificate not authentic"

# Evaluate role-specific compliance after verification.
node "$CLI" status --db "$DB" --subject-type ADULT --subject-id PERSON_UUID \
  --role COACH --scope-type LEAGUE --scope-id demo-league \
  --season-id demo-2026 --date 2026-10-13
```

Every successful command emits one JSON object on stdout. Errors go to stderr and return a nonzero exit code. This makes it suitable for future automation. `--attest-reviewed` is an explicit human assertion, **not independent authentication**; production verification must use a properly authenticated and scoped registrar account.

## Integration contract for a future email parser

1. Fetch mail with narrowly scoped permissions and deduplicate by provider message ID. Never rely solely on the sender's address for trust.
2. Extract only course, candidate identity, completion/expiration dates and an encrypted evidence reference.
3. Resolve candidate identity using a separately verified permanent participant ID. If uncertain, send the claim to a reconciliation queue; do not auto-create or merge participants.
4. Call `ingest` with `verification: "PENDING"` or `"REVIEW_REQUIRED"`.
5. A registrar reviews the issuer, document, dates and person association before invoking `verify`.
6. The verified completion is stored once and is evaluated under the existing season/annual renewal policy.

The CLI does not read Gmail, Outlook, IMAP, or attachments itself. It is the ingestion boundary that such a processor can call later.

## Tests

```bash
node --test apps/rink-local/tests/browser/training-intake-cli.test.js
```

Coverage: pending never satisfies eligibility, verified does, rejected does not, duplicate source handling, conflict rejection, privacy of source IDs, unknown participant refusal, invalid verification flags, and bounded metadata input.
