# Icebreaker – Workflow, Signatures and Parent Portal Requirements

Status: PROPOSED (design specification, not implemented backend functionality).

## Configuration and workflow

- WF-001 P0: A league administrator shall select a validated, immutable, versioned certification policy for each game; the policy version shall be pinned at game creation or explicitly migrated with an auditable approval.
- WF-002 P0: The policy shall configure approval roles/counts, unresolved-attribution handling, reminder/escalation delays, and certified-result publication triggers.
- WF-003 P0: No configurable workflow shall bypass identity validation, game authorization, event-sequence integrity, audit logging, or tamper-evident certification binding.
- WF-004 P0: A workflow execution shall resume safely after server restart and process external events idempotently.
- WF-005 P1: A league administrator shall validate and simulate a candidate policy against test games before publishing it; no arbitrary untrusted script execution shall be allowed in league-authored policy files.

## Scoresheet approval / signatures

- SIGN-001 P0: Only an authorized and authenticated official assigned to the game may approve a final scoresheet under the active workflow.
- SIGN-002 P0: The approval shall capture explicit intent, signer ID/role, UTC timestamp, approved game event revision, canonical scoresheet digest, and authentication context.
- SIGN-003 P0: Any material correction to a signed revision shall create a new reviewable revision; signatures shall not be silently carried forward.
- SIGN-004 P0: The system shall expose approval, rejection, requested-correction, and escalation outcomes with audit trails.
- SIGN-005 P1: Offline approval shall be provisional until device/identity and signed revision integrity are verified centrally.
- SIGN-006 P2: External eSignature vendors may be integrated for waivers or contracts without being required for game certification.

## Parents, favorites, and reporting

- FAN-001 P0: Parents shall be able to create an account, authenticate, and manage verified email addresses and consent/preferences.
- FAN-002 P0: Signed-in users shall be able to follow or unfollow teams and league-permitted player profiles using stable IDs.
- FAN-003 P0: A guardian relationship and league visibility policy shall gate access to restricted minor/player information; following a player shall confer no additional private-data privileges.
- FAN-004 P0: User-specific dashboards shall display upcoming followed-team games, latest results, and permitted followed-player statistics.
- FAN-005 P0: The parent Live Game Tracker shall display the full official live score and approved event feed even when an arena scoreboard is mercy-capped; results are provisional until certified.
- FAN-006 P0: When a followed team's game is certified, users opted in to end-of-game email shall receive one idempotently generated report containing final score, goal and penalty summaries, permitted player stats and game link.
- FAN-007 P0: A subsequently corrected certified game shall produce a clearly versioned correction notice instead of quietly changing an already emailed report.
- FAN-008 P0: Each report shall record the result revision, template version, delivery status, retry attempts, consent state at dispatch and delivery provider message ID where available.
- FAN-009 P0: Users shall be able to unsubscribe in one step, manage frequency, and delete their account according to data retention and legal obligations.
- FAN-010 P1: Users shall be able to configure immediate, daily digest, or no email; reporting shall obey rate limits and prevent event-triggered notification storms.
- FAN-011 P1: League admins shall configure visibility and retention by age/division, defaulting minor profiles to conservative disclosures.
- FAN-012 P1: Optional report PDF download shall use the same certified revision and permission-filtered data as email.

## Tests/traceability (minimum acceptance scenarios)

- WF-001: Editing a published policy results in a new version; existing games retain their pinned version.
- WF-003: A policy attempting to remove event integrity checks is rejected.
- WF-004: Kill workflow host after referee approval but before notification; restart and verify approval is not duplicated and email is sent at most once per revision+recipient.
- SIGN-001: Unassigned official attempts to sign; authorization fails and attempted action is audited.
- SIGN-002: Approval digest changes after a goal correction; old signature remains attached to old revision only.
- FAN-002: Follow/unfollow operations are idempotent and independent of public display name or jersey changes.
- FAN-003: A favorite-player link cannot reveal a private minor profile or guardian contact details.
- FAN-005: With official 10–2 and arena cap 7–2, Live Tracker displays 10–2.
- FAN-006: Game is submitted final but not certified; no certified-result email. On certification, exactly one report is queued for each eligible subscriber.
- FAN-007: Certified revision 2 correction triggers revision notice referencing revision 1; no extra game result created.
- FAN-009: Unsubscribe between report creation and dispatch blocks delivery.
