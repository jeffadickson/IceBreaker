# IceBreaker Backend Certificate Intake CLI — Requirements

## Scope

A future mail processor, registration provider connector, or batch importer must be able to submit structured training certificate metadata to IceBreaker without bypassing the registrar verification workflow. This is a development/offline CLI, not a production-facing identity or authorization system.

## Functional requirements

- CLI-001 P0: Provide machine-readable commands to list courses, stage intake, list pending records, verify/reject, and check training status.
- CLI-002 P0: Support a JSON input file or stdin so a future email-processing program can invoke the CLI without passing private data as command-line arguments.
- CLI-003 P0: Imported claims default to PENDING and **never** count as verified training evidence.
- CLI-004 P0: Source types include EMAIL, API, MANUAL and BATCH. Deduplicate using an HMAC of a stable source ID, not a plaintext email message identifier.
- CLI-005 P0: Repeated imports of identical metadata are idempotent; conflicting data for the same source ID is rejected and never silently overwrites a certificate.
- CLI-006 P0: An existing permanent player/adult ID and a known training catalog course are required. Never infer identity from name, email, or certificate contents.
- CLI-007 P0: Explicit manual review can change PENDING to VERIFIED or REJECTED with reviewer and reason. Verification atomically creates one completion in the existing `training_completions_v2` ledger.
- CLI-008 P0: Rejection and duplicate imports do not create training credit; previously decided claims cannot be decided again.
- CLI-009 P0: A verification command must require explicit attestation that a human checked the certificate and identity. The CLI must not treat an email parser's `verification` field as authorization.
- CLI-010 P0: Output one JSON result per command and use nonzero exit codes for errors. Limit input size and reject unexpected fields, raw email bodies and attachments.
- CLI-011 P0: Record intake and decision audit events without raw email identifiers or certificate contents.
- CLI-012 P0: Enforce existing season/annual/rolling training policies using the verified completion ledger.
- CLI-013 P0: Prevent this unauthenticated development CLI from performing production verification.

## Security and deployment

Use a restricted OS service account, file permissions, and a separately provisioned HMAC key. Never expose SQLite or the CLI directly to email senders. The email parser is an untrusted producer of candidate claims. Secure evidence documents remain in the encrypted document vault and must pass malware scanning. The CLI does not authenticate the actor name; production verification must use scoped authenticated registrar identity and MFA.

## Future enhancements

- Unmatched identity reconciliation queue for certificates that cannot be mapped to a permanent person.
- Provider-specific email parsing and issuer signature validation.
- Authenticated central-service ingestion API and job queue with rate limits.
- Bulk review, encrypted document attachment linking, and annual renewal reminders.
- Full integration with verified USA Hockey registration identifiers and issuer-specific validation.

## Verification

See `apps/rink-local/tests/browser/training-intake-cli.test.js` and `apps/rink-local/docs/backend-cli-training-intake.md`.
