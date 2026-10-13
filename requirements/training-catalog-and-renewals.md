# IceBreaker Training Catalog and Annual Renewal Requirements

## Purpose

Training is configurable data, not a hard-coded set of database columns. A league or tournament can introduce, retire, or revise a course without a schema migration. This design extends, rather than removes, existing season training tables and historical evidence.

## Data model

| Table | Purpose |
|---|---|
| training_catalog | Permanent course identity, code, title, description, issuer and active status |
| training_policy_versions | Append-only rule revisions by course, role, league/tournament, season and effective dates |
| training_completions_v2 | Permanent person-level completion ledger with verification, expiration and revocation |
| participant_role_assignments | Roles such as coach, manager, parent, player or official |
| competition_policies | League versus tournament behavior for each game |

The primary key is an internal UUID. Courses have unique codes such as SAFESPORT or ANTI_BULLYING. Course titles and policy definitions are data, not code. An adult may have multiple roles; one verified completion can satisfy several applicable role policies when the dates and renewal rules allow it.

## Renewal policies

- ONCE: valid after the completion date unless its explicit expiry is reached or it is revoked.
- ANNUAL_CALENDAR: the completion must fall in the calendar year of the eligibility check.
- ANNUAL_SEASON: the completion must fall between the configured season start and end dates and on or before the eligibility check. Requires a season ID.
- ROLLING_DAYS: the completion must be no more than the configured number of days old, including the boundary day. Explicit expiry also applies.

Each policy also stores required/optional, effective-from, optional effective-through, role and scope. The most recent effective revision for a course applies at the requested date. A revision must begin later than its predecessor; existing policies and completions are not overwritten. A new season can have a different requirement without changing the previous season.

## Examples

| Course | Role | Renewal | Competition |
|---|---|---|---|
| SafeSport | Coach | Every season (example policy) | League |
| SafeSport | Team manager | Every season (example policy) | League |
| Anti-bullying | Player | Every calendar year | League |
| Orientation | Volunteer | One time | League |
| First aid | Coach | Every 365 days | League |
| Tournament briefing | Player | One time for the event | Tournament |

These are examples, not claims about any governing body's current requirements. Administrators determine actual rules.

## Enforcement

The game-day lineup confirmation, pregame readiness check and rink event roster gate consult the configurable catalog. An incomplete mandatory player course blocks the league lineup. Adult course status is available to authorized league administrators; automatic bench check-in enforcement for coaches and managers is a separate milestone.

Tournament games can explicitly omit league requirements and apply their own course policies. Suspensions remain separately enforced. Training records and historical certifications are never deleted merely because a tournament has no requirements.

## Administration

The league administrator web page at `/registration.html` includes training catalog creation, policy revision, completion verification, revocation and role-status queries. The scoped API endpoints are:

- `GET/POST /api/registration/v1/training/catalog`
- `POST /api/registration/v1/training/policies`
- `POST /api/registration/v1/training/verify`
- `POST /api/registration/v1/training/revoke`
- `POST /api/registration/v1/training/role-status`

Only authenticated, authorized league administrators can use these endpoints. The evidence reference points to a separately controlled secure document; the training table does not store scans.

## Compatibility and remaining work

Legacy `season_training_requirements`, `player_training_completions`, `competition_training_rules` and `participant_training_evidence` remain readable and enforceable. They have not yet been migrated into the new catalog, and an administrator should avoid duplicating the same required course in both systems. Future work includes a controlled legacy-data migration, automatic renewal reminders, coach/manager bench eligibility enforcement, and central production storage.

Production registration and use of real minors' private information remain blocked pending the existing security release gates.

## Verification

Run `node --test apps/rink-local/tests/browser/training-catalog.test.js` or the full repository CI. Tests cover season renewal, calendar renewal, rolling expiration, policy revision history, revocation and tournament exemption.
