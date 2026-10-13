# IceBreaker club and league registration portals — requirements v1
Status: development implementation; **do not enter real minors' PII** until encryption, production identity, consent and deployment review are complete.

## Ownership and access
- REG-001 (P0): Each player has one permanent ID across seasons, clubs, divisions, and teams. Neither club transfers nor annual rollover may duplicate or reset the identity.
- REG-002 (P0): Clubs manage private player and guardian records **only within their explicit club membership scope**. A club registrar cannot browse or edit another club's player.
- REG-003 (P0): League administrators own league eligibility policy, annual training requirements, suspension actions, and roster approval; a club registrar cannot self-approve a submitted roster.
- REG-004 (P0): Team managers see approved rosters and game-day eligibility only; no DOB, address, legal name, guardian contact or registration number is exposed to public feeds, PA or game sync.
- REG-005 (P0): Authenticate portal users with distinct scoped accounts, password hashing, hashed expiring session tokens, and server-side authorization on **every** read/write. Do not use the rink operator credential for private registry access.
- REG-006 (P0): Provision club/league accounts and club-to-team mappings through an authorized development bootstrap path; no unauthenticated self-provisioning.
- REG-007 (P0): Every approval, rejection, transfer, registration edit and training verification is audited without storing raw sensitive PII in audit payloads.

## Club registration
- REG-010 (P0): Club registrar can search their own registered players, inspect private profiles and related persons, and create new player profiles.
- REG-011 (P0): New-season roster drafts use existing permanent player IDs. Jersey and playing position are season-specific; team and division membership are historical.
- REG-012 (P0): A club submits a player/team registration for league approval. League approval atomically enrolls the player; rejection retains the proposal and reason. Duplicates and stale approvals must be rejected.
- REG-013 (P0): Registrars can preview CSV roster imports and submit valid rows; reject malformed, duplicate or ambiguous player identifiers before any enrollment. Imports never auto-create identities from names alone.
- REG-014 (P1): Annual rollover proposes existing club players into new season teams, with explicit human confirmation and eligibility checks.
- REG-015 (P1): Bulk upload supports validation summary, per-row errors and dry-run, with no partial approvals.
- REG-016 (P0): Related persons can be linked across siblings only within an authorized club scope; linking a contact is not proof of guardianship.
- REG-017 (P0): League admins can revoke a former club's access after transfer, with audit and protection against unlinking a player still on that club's roster.

## League administration
- REG-020 (P0): League administrators can view pending requests within their league and approve/reject them with a reason and actor audit.
- REG-021 (P0): League administrators define yearly training requirements and verify completions; only compliance status is visible to managers.
- REG-022 (P0): Suspensions remain league-owned and prevent game-day lineup participation.
- REG-023 (P1): Approved transfers with existing confirmed lineups require a separate audited amendment, not silent replacement.

## Family self-service (next security milestone)
- REG-030 (P0 before production): A parent/guardian can access **only their verified child relationships** and request profile corrections, subject to registrar approval.
- REG-031 (P0 before production): Guardianship is not inferred from a contact link. Verify legal authorization and obtain necessary consent.
- REG-032 (P0 before production): Implement field-level encryption or encrypted data store, encrypted backups, audit of sensitive reads, retention/deletion, recovery and incident procedures.
- REG-033 (P0 before production): MFA for administrators, rate limits, session revocation, CSRF defenses for cookie sessions, and external security review.

## Acceptance
- A club registrar cannot read or modify another club's private player records, or approve their own roster request.
- A league administrator cannot approve a roster request for another league.
- The same player transfers or changes divisions and seasons without losing history.
- A rejected or duplicate request never changes membership.
- Annual compliance and suspension rules still gate game-day lineups.
- Bulk imports reject ambiguity; no name-based identity merges.
- Public endpoints and local event feeds remain free of private registration fields.

## Implemented vs release-gated
This phase builds development portals, scoped accounts, approval requests, and import preview on top of the existing permanent player registry. Family self-service, MFA, encrypted PII at rest, consent verification and deployment hardening are **not** considered implemented and prohibit production use with real minors' records.
