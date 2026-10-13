# IceBreaker club and league web registration (development)

**Do not enter real minors' PII.** The registry currently uses ordinary SQLite storage without production encryption, MFA, verified guardianship or secure backups. These must be completed before real player registration.

## Open the portals

Start the existing rink-local server and visit:

- `http://127.0.0.1:8090/registration.html` — role-aware **Club Registrar** or **League Administrator** web interface.
- `http://127.0.0.1:8090/team.html` — existing team manager roster and game-day lineup portal.

Club and league accounts have separate password-based login and scoped, expiring bearer sessions. **The timekeeper operator credential cannot read private registration records.** The operator key is used only for development provisioning of registrar accounts and club-to-team mappings.

## Development bootstrap (fictional data only)

These examples are intended for a local development machine. Change the default operator key and never expose the server publicly. For a demonstration league, run these HTTP requests with the `X-Operator-Key` header:

```bash
# Create a club in the existing demo league.
curl -X POST http://127.0.0.1:8090/api/registration/v1/bootstrap/club \
 -H 'X-Operator-Key: local-development-key' -H 'Content-Type: application/json' \
 -d '{"id":"club-demo","name":"Fictional Demo Club","leagueId":"demo-league"}'

# Associate the club with its existing demo team.
curl -X POST http://127.0.0.1:8090/api/registration/v1/bootstrap/team \
 -H 'X-Operator-Key: local-development-key' -H 'Content-Type: application/json' \
 -d '{"clubId":"club-demo","teamId":"maple"}'

# Provision a scoped club registrar. Use a different, strong test password.
curl -X POST http://127.0.0.1:8090/api/registration/v1/bootstrap/user \
 -H 'X-Operator-Key: local-development-key' -H 'Content-Type: application/json' \
 -d '{"email":"registrar@example.invalid","password":"replace-with-long-test-password","role":"CLUB_REGISTRAR","scopeId":"club-demo"}'

# Provision a league administrator. This account approves rosters.
curl -X POST http://127.0.0.1:8090/api/registration/v1/bootstrap/user \
 -H 'X-Operator-Key: local-development-key' -H 'Content-Type: application/json' \
 -d '{"email":"league@example.invalid","password":"another-long-test-password","role":"LEAGUE_ADMIN","scopeId":"demo-league"}'
```

For any other club/team, an authorized league bootstrap action must explicitly associate the team with the club. No club can claim a team from another league.

## Club registrar workflow

1. Sign in to `registration.html`. Only players linked to that club are listed.
2. Create a fictional permanent player profile (or ask the league to link an existing player ID). Add related parents/guardians and update the private profile as needed. For siblings already in the same club, reuse an existing related-person ID rather than creating a duplicate contact.
3. Select a team, jersey and position; submit a **pending registration**. This does not immediately change the approved roster.
4. For bulk data, upload a CSV with header `playerId,teamId,jersey,position`. Preview validation and submit up to 250 rows atomically. Rows must reference **existing permanent player IDs**; never merge identities by name.
5. For annual rollover, select prior-season and next-season teams within the same club, preview the players, then submit the new season requests for league approval. The permanent player IDs and historical statistics do not change.

## League administrator workflow

1. Sign in with a league-scoped account.
2. Review the league's pending registration requests and approve/reject each with a reason.
3. Approval atomically creates the season membership and history entry; rejection never changes the roster. An already-decided request cannot be decided twice.
4. Optionally configure a division-specific age cutoff and allowed age range; approvals are rejected atomically if a player's private birth date makes them ineligible. Define annual training requirements and verify completions. Existing lineup eligibility checks still enforce expired or missing mandatory training.
5. Authorize linking an existing player ID to a club only if the player already belongs to that league. Cross-league identity transfers require a separate verified workflow and are deliberately blocked in this development portal. After the transfer, revoke a former club's private-record access with an audited reason; removal is blocked while that player still has an active roster membership with the former club. Do not create duplicate player records for transfers.

The team-manager portal cannot bypass approval for a team assigned to the new club registration system. It can still edit the approved **game-day lineup**.

## Access and security boundaries

- Club registrar: private records only for players linked to that club, and roster proposals only for teams explicitly assigned to that club. Every successful private profile read is recorded in the league audit without copying PII into the audit payload.
- League administrator: pending registrations and authorized player records within that league; can approve/reject but cannot use club-only creation actions.
- Team manager: roster aliases, game-day participation and eligibility flags, not private addresses, DOBs or guardian contact details.
- Public scoreboards and rink event sync: **no private registry fields**.
- Account bootstrap: development operator key only; this is not a production administrative invitation system.

## Remaining release blockers

Verified parent/guardian self-service and correction requests, MFA, account invitation/recovery, production-grade immutable access-log retention, encrypted storage/backups, retention and consent policies, duplicate-identity review/merge, production consent checks on transfers, secure evidence uploads, and an actual production deployment security assessment. A successful test run is not permission to use this with real minors' records.

## Tests

```bash
node --test apps/rink-local/tests/browser/registration-portal.test.js
node --test apps/rink-local/tests/browser/registration-http.test.js
npm test
```

Tests exercise club isolation, league approval, duplicate rejection, annual rollover, atomic CSV submissions, password/session handling, and HTTP authorization.
