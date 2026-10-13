# IceBreaker participant identity, role training, and tournament policies

## Requirements

- IDENT-001: Every person has a permanent internal UUID. USA Hockey registration numbers, league member numbers, and tournament-issued numbers are optional **alternate identifiers**, never the database primary key.
- IDENT-002: Store issuer, identifier, optional season and verification actor. Do not assume that a USA Hockey registration number is permanent across years or universally required. Duplicate issuer/season/number must not silently merge people.
- IDENT-003: Allow the same adult to hold several roles: parent, guardian, coach, manager, volunteer, official. The same person may be both a parent and coach, with different role requirements.
- IDENT-004: Protect external IDs as private data; encrypted ciphertext plus keyed HMAC lookup, never in public scores, announcements, or game-event sync.
- TRAIN-101: Courses (e.g., SafeSport, anti-bullying, coaching certification) are named **configurable rules**, not hard-coded regulatory assertions.
- TRAIN-102: Assign rules to role, league/tournament scope and optional season. Store completion and expiration on the person; reevaluate eligibility for the game date.
- TRAIN-103: A course may be required for a coach while not required for that same adult acting only as a parent.
- TRAIN-104: Youth-specific requirements can apply to players independently of adult compliance.
- TOUR-101: An independent tournament can explicitly disable **league-specific training requirements** for its games. Absence of USA Hockey or league number is not automatically an eligibility failure.
- TOUR-102: Tournament organizers can add their own explicit training rules. Tournament exemptions must not erase training records or automatically waive suspensions, safety rules, age eligibility or other restrictions.
- TOUR-103: An ordinary league game continues to enforce its league requirements by default; an exemption must be explicitly configured and audited by a league administrator.
- TOUR-104: Tournament guest participants may use internal IDs without external numbers. Single-event guest entry is implemented for league administrators; bulk imports and tournament-wide policy administration are future milestones.

## Implemented development model

The internal schema is initialized with the league store:

- `participant_external_ids`: subject PLAYER or ADULT, issuer, optional season, encrypted identifier, keyed HMAC index, verifier.
- `participant_role_assignments`: role scoped to a league or tournament.
- `competition_training_rules`: configurable course requirements per role and scope.
- `participant_training_evidence`: verified completion and expiration records.
- `competition_policies`: explicit game-bound LEAGUE or TOURNAMENT mode, including whether legacy league player training is enforced.

New external numbers require **both** `ICEBREAKER_PRIVATE_FIELD_KEY_BASE64` and a distinct `ICEBREAKER_IDENTIFIER_INDEX_KEY_BASE64`, each a random 32-byte base64 key. Neither key is stored in the database. The existing historical player registration table is legacy and requires a separate migration.

The league administrator API has scoped endpoints under `/api/registration/v1/`:

- `POST competitions/policy`: gameId, type, note, optional requireLegacyPlayerTraining
- `POST participants/external-id`: subjectType, subjectId, issuer, identifier, optional seasonId
- `POST participants/role-requirements`: scopeType, scopeId, role, code, title, optional seasonId, required
- `POST participants/training-evidence`: subjectType, subjectId, code, completedOn, optional expiresOn

The game-day manager confirmation, pregame authority gate, and event roster gate evaluate game-specific player training rules. League suspensions remain separate.

## Remaining work

The new adult role/course engine exists, but adult coach/manager access accounts are not yet linked to verified permanent person identities, and their compliance is not yet enforced at bench check-in. Tournament-wide administration, guest imports, federation ID verification, and parent-facing training evidence upload remain to be implemented. Production key management, encrypted backups, consent verification, MFA enforcement, and security review remain mandatory.
