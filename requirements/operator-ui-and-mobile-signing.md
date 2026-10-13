# IceBreaker operator console and mobile referee signing — iterative design

Status: **development increment 1**. This document is a living UI specification; rink operators, referees and managers will change the workflows during field testing.

## Native timekeeper design

- UI-001 P0: A fixed, high-contrast scoreboard and authoritative game clock SHALL remain visible while switching workflows. The UI SHALL never advance official time locally.
- UI-002 P0: Provide a single, touch-friendly main scoreboard with quick actions for clock, goal, penalty, and goalie changes. Secondary workflows SHALL open as dismissible overlays without hiding the official clock or requiring tab navigation.
- UI-003 P0: Native scoring SHALL support a goal with scorer and up to two assists, basic penalty entry, and goalie substitutions including an empty net. Server-side roster and event validation remain authoritative.
- UI-004 P0: Every scoring mutation SHALL use the existing audited, idempotent local authority API; draft controls SHALL NOT alter the game until explicitly committed.
- UI-005 P0: Loss of backend connection SHALL disable mutations, display an unambiguous warning, and recover from the authoritative snapshot on reconnect.
- UI-006 P0: Time corrections SHALL remain constrained to a stopped clock and division-specific bounds; the UI must not infer period duration.
- UI-007 P0: Show committed event history with source-backed ordering, never optimistic local events.
- UI-008 P1: Add roster-backed jersey selection, penalty classifications/stacking, goal corrections, shot entry, keyboard shortcuts and a dedicated undo/amendment review.
- UI-009 P1: Run actual rink tests on 1366×768 and 1920×1080 laptops, touchscreen and keyboard, with timed operator scenarios.
- UI-010 P0: The independent authority process SHALL survive closing or crashing the native window.

## Mobile referee review and signing

- SIGN-001 P0: A referee SHALL sign in with their own assigned identity; the timekeeper's credentials cannot approve a scoresheet.
- SIGN-002 P0: The review screen SHALL show final score, goals, assists, penalties, shots, source revision and SHA-256 digest with a mobile-readable layout.
- SIGN-003 P0: Approve SHALL remain disabled until explicit signing intent is checked. Requesting a correction SHALL require an explanation, not an approval checkbox.
- SIGN-004 P0: Before submission, re-read the current revision and digest. Refuse stale or superseded content. Server-side validation remains mandatory.
- SIGN-005 P0: Prevent double-submit, show pending/success/error states, and keep all decisions auditable.
- SIGN-006 P0: Do not call an authenticated approval a cryptographic PDF signature. Production signing requires identity verification, policy/legal review, secure sessions and an accepted signing method.
- SIGN-007 P1: Support configurable one- or multi-referee approval policies and ensure every required signature binds to the same frozen revision.
- SIGN-008 P1: Produce a certified PDF with verifiable digital signature, timestamps, audit trail and correction/resubmission history where required.
- SIGN-009 P0: The mobile UI SHALL work without horizontal scrolling on a typical phone and support keyboard, touch and assistive technology.

## Increment 2: single-screen, minimum-interaction entry and corrections

- UI-011 P0: The **main game screen** SHALL always show both teams, score, period, authoritative time, running/paused status, and primary event actions. No tab navigation is required for routine goal, penalty, goalie or shot entry.
- UI-012 P0: Team-specific action buttons SHALL preselect the team and open a compact modal entry overlay **over the scoreboard**, preserving visible context. Closing a draft SHALL never create a game event.
- UI-013 P0: Draft fields SHALL remain freely editable before commit, with one explicit commit action. A cancelled draft SHALL not affect official state. The operator SHALL receive clear confirmation or an actionable validation error.
- UI-014 P0: After commit, a correction SHALL reference the original event ID, operator identity, reason and an idempotency key, and be appended to the immutable audit/event history. Original events SHALL remain inspectable; no direct row overwrites.
- UI-015 P0: The interface SHALL distinguish **draft edit**, **committed correction**, **void/reversal**, and **postgame certified-scoresheet amendment**. Unsupported correction types SHALL be disabled rather than faked as successful.
- UI-016 P0: Corrections after scoresheet submission SHALL respect referee review and resubmission rules; signatures to older revisions SHALL not carry over silently.
- UI-017 P0: Target routine unassisted goals in 2–3 selections, assisted goals in 3–5, and common minor penalties in 3–4, measured from the scoreboard using an already-selected approved roster. Do not sacrifice accurate attribution for a click-count target.
- UI-018 P0: Popup opening, draft editing, and closing SHALL not pause, restart or advance the official clock. The clock remains controlled exclusively by the rink authority.
- UI-019 P1: Support quick event correction from a recent-events list, prepopulating the last committed values, and require reason/confirmation only for post-commit amendments.
- UI-020 P1: Measure median and 95th-percentile interaction time and error rate during full-game simulation; refine based on timekeeper feedback.

**Correction support at this stage:** the authority supports audited `GOAL_ATTRIBUTION_CORRECTED` with an original event reference and reason. Postgame attribution correction requires the existing referee-requested correction/resubmission workflow. Arbitrary penalty editing, goal voiding and score reversals are **not yet general-purpose supported commands** and must not be exposed as operational UI actions until implemented and tested.

## Increment 1 implementation

- Native Avalonia window: persistent score/clock header; four tabbed workflows; basic goal/assist and goalie event forms; existing penalty, phase, timeout and PA controls; committed event list.
- Mobile referee web review: responsive controls, visible revision and digest, signing checklist, duplicate-submit protection and a pre-submit stale revision check.
- Neither change replaces the local authority or alters the underlying immutable game event journal.

## Known limitations and next iterations

- Native goal and goalie entry currently uses text fields, not a confirmed-roster picker. The backend rejects invalid roster assignments. Native advanced penalty management and amendment flow remain.
- Mobile review uses existing development referee authentication and approval records; no production digital PDF signature, MFA, multiple signer policy, or secure public deployment is claimed.
- The current native client still needs hands-on Windows usability testing. A successful CI compile is not a rink acceptance test.
- Collect operator feedback after a full simulated game and revise tab order, button size, keyboard shortcuts and review steps without changing scoring semantics.
