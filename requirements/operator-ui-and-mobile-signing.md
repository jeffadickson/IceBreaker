# IceBreaker operator console and mobile referee signing — iterative design

Status: **development increment 1**. This document is a living UI specification; rink operators, referees and managers will change the workflows during field testing.

## Native timekeeper design

- UI-001 P0: A fixed, high-contrast scoreboard and authoritative game clock SHALL remain visible while switching workflows. The UI SHALL never advance official time locally.
- UI-002 P0: Provide distinct, touch-friendly tabs for clock/periods, scoring, committed event history and PA announcements. Each tab SHALL remain usable on typical laptop resolutions without hiding the game clock.
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

## Increment 1 implementation

- Native Avalonia window: persistent score/clock header; four tabbed workflows; basic goal/assist and goalie event forms; existing penalty, phase, timeout and PA controls; committed event list.
- Mobile referee web review: responsive controls, visible revision and digest, signing checklist, duplicate-submit protection and a pre-submit stale revision check.
- Neither change replaces the local authority or alters the underlying immutable game event journal.

## Known limitations and next iterations

- Native goal and goalie entry currently uses text fields, not a confirmed-roster picker. The backend rejects invalid roster assignments. Native advanced penalty management and amendment flow remain.
- Mobile review uses existing development referee authentication and approval records; no production digital PDF signature, MFA, multiple signer policy, or secure public deployment is claimed.
- The current native client still needs hands-on Windows usability testing. A successful CI compile is not a rink acceptance test.
- Collect operator feedback after a full simulated game and revise tab order, button size, keyboard shortcuts and review steps without changing scoring semantics.
