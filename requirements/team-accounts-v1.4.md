# Team account and game-day roster requirements (proposed v1.4)

| ID | Priority | Requirement | Acceptance criterion |
|---|---|---|---|
| TEAM-001 | P0 | The league shall provision individual accounts scoped to designated teams with manager, coach and viewer roles. | User assigned to Team A cannot view or modify nonpublic Team B rosters. |
| TEAM-002 | P0 | Authorized team representatives shall add and update roster memberships using stable player identifiers and season-specific jersey numbers. | Roster updates persist and increment the roster revision. |
| TEAM-003 | P0 | The system shall capture a separate game-day roster snapshot for each team in each scheduled game. | Confirmation saves game, team, selected stable player IDs, signer and timestamp. |
| TEAM-004 | P0 | Roster confirmation shall require an authenticated manager or coach, and each listed player shall belong to that team's eligible season roster. | Unauthorized and off-roster submissions are rejected. |
| TEAM-005 | P0 | All roster edits, confirmations, amendments and failed authorization attempts shall have an auditable record. | Operator and action records are retained; rejected requests are not applied. |
| TEAM-006 | P0 | Roster changes and game confirmations shall reject stale revisions. | Parallel edits cannot silently overwrite newer selections. |
| TEAM-007 | P0 | Once play starts, an amended lineup shall require a separate authorized and audited process and must not rewrite the previous lineup snapshot. | Confirmation endpoint rejects live confirmed-lineup changes. |
| TEAM-008 | P0 | Certification shall reconcile goal and penalty participant IDs against approved game rosters, including late authorized additions. | Off-roster attribution blocks ordinary certification. |
| TEAM-009 | P1 | Team staff shall be able to select active, absent, suspended, injured and goalkeeper-designated players, subject to league privacy policies. | Unavailable players cannot be confirmed without a documented exception. |
| TEAM-010 | P1 | Both teams' representatives shall be able to sign off on their own game-day lineups separately. | One team's confirmation never confirms the other. |
| TEAM-011 | P1 | League policy shall set lineup submission deadlines and whether unconfirmed lineups block game start or certification. | Policy-specific decision is deterministic and logged. |
| TEAM-012 | P1 | Team accounts shall support secure invitation acceptance, password recovery, optional Google sign-in and MFA for privileged roles. | Role binding is admin-approved and never inferred from email domain. |

## Implementation status

A **local development implementation** of TEAM-001 through TEAM-004 and TEAM-006, with basic audit records under TEAM-005, is in `apps/rink-local/server/team-accounts.js` and `apps/rink-local/web/team.html`. TEAM-007 is partially enforced by rejecting changes to an already-confirmed live game. TEAM-008 through TEAM-012 require further engineering. In particular, team-manager creation currently relies on the development-only league operator credential; do not deploy publicly until admin identity, invite workflow, session controls, and authorization audits are hardened.

## Suggested workflow

League admin grants account → manager updates season roster → coach chooses attending players → authenticated representative confirms lineup and revision → rink station imports lineup → officials review discrepancies → game certification compares against signed lineup. Separate pregame deadlines, roster locks and emergency amendments should be defined by a versioned league workflow policy.
