# Permanent player identity, yearly rosters, and private compliance records

Status: foundational schema and internal APIs implemented; administrator UI, production RBAC and encryption controls remain release blockers.

## Identity and season design

- **PLAYER-001 P0:** Each player SHALL have a stable, generated, immutable UUID independent of team, division, season, jersey, or listed playing position.
- **PLAYER-002 P0:** Store legal name, date of birth, and residential address in a **private** profile. Derive age at the league's published season eligibility cutoff; do not store a mutable age field.
- **PLAYER-003 P0:** Link optional federation registration numbers or season-specific registration/ticket identifiers to the permanent player ID, with uniqueness checks and private storage.
- **PLAYER-003A P0:** Link a player to one or more related people (parent, legal guardian, emergency contact, or other) by permanent person ID. A person may be related to multiple players. Relationship does not itself grant app access or legal guardianship authority.
- **PLAYER-004 P0:** Keep season/team/jersey/position as a separate membership record. Retain historical team and division affiliation through season membership history.
- **PLAYER-005 P0:** A new-season enrollment or approved transfer SHALL reuse the same player ID, preserving historical statistics, guardian links and verified training records.
- **PLAYER-006 P0:** A same-season league transfer SHALL close the old membership and open the new one atomically. Confirmed live/scheduled game lineups require authorized amendment rather than silent reassignment.
- **PLAYER-007 P0:** Avoid automatic identity merging based only on name, DOB, address or jersey. Duplicate identities must be reviewed by an authorized registrar.
- **PLAYER-008 P0:** Public scoring feeds, parent dashboards, PA announcements, and rink sync SHALL NOT expose DOB, address, legal name, guardian contacts, training evidence or disciplinary notes.

## Training and eligibility

- **TRAIN-001 P0:** A league defines season-specific requirements (code, name, due date, blocks-lineup policy). Requirements are linked to league + season, not just the player's age group.
- **TRAIN-002 P0:** Store completion date, optional expiration, verification actor/time and evidence reference separately from the player's permanent identity. An annual renewal is a new record for the new season.
- **TRAIN-003 P0:** Training status is evaluated for the actual scheduled game date. Expired, revoked, or missing required training blocks selection only when that requirement's enforcement date is reached.
- **TRAIN-004 P0:** Training status SHALL be reevaluated before game start/certification; a previously confirmed lineup does not override a subsequently revoked training completion.
- **TRAIN-005 P0:** Managers see eligibility and outstanding requirement codes, not uploaded documents, birth dates, addresses, or private related-person details.
- **TRAIN-006 P1:** Allow registrar verification and revocation with auditable actor/reason; prevent an ordinary manager from self-certifying mandatory training.
- **TRAIN-007 P1:** Define league-specific annual requirements and age-eligibility cutoffs explicitly rather than hard-coding USA Hockey or any particular governing body.

## Privacy and migration

The new `player_private_profiles`, `player_registration_identifiers`, `player_related_people`, `player_person_links`, `season_training_requirements`, `player_training_completions` and `player_membership_history` tables live in the league SQLite database. The current registry is an internal module, with **no public API endpoints** for sensitive profiles. Legacy memberships are marked `LEGACY_IMPORT` because their true join dates are unknown.

**Before production with real minors' data:** isolate sensitive records in a separately encrypted datastore or enable database encryption, enforce registrar-only access and parent/guardian consent/authorization, audit all reads and changes, implement retention/deletion policies and secure backups, verify legal requirements, and complete the identity-duplicate/merge review workflow. The existing development manager roster editor can still create a name-only placeholder; it must be replaced by registrar-controlled enrollment before production. Never import actual DOBs or addresses into the current development deployment.

## Verification

`node --test apps/rink-local/tests/browser/player-registry.test.js`

Coverage includes multi-season identity continuity, same-season transfer, linked-person retention, privacy exclusion from public snapshots, annual training eligibility and post-confirmation revocation.
