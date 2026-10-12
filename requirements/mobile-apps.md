# MOB — Parent and Team Manager Mobile Applications

Status: proposed requirements, 2026-10-12. Applies to hockey first, with sport-neutral account, navigation, schedule, notification, and storage contracts.

## Product and platform

- **MOB-001 (P0):** IceBreaker SHALL provide a responsive, touch-accessible parent experience for current supported mobile browsers, including live scoreboard, full uncapped score, goals, penalties, shots, game status, schedule, standings and player statistics.
- **MOB-002 (P0):** IceBreaker SHALL provide a mobile Team Manager experience, using existing team-scoped roles, for game-day roster confirmation, jersey edits, manager checklists and scoresheet/evidence submission.
- **MOB-003 (P0):** Mobile views SHALL use central sport-neutral authenticated APIs and versioned sport capability declarations rather than separate mobile game engines or hard-coded hockey assumptions.
- **MOB-004 (P1):** The web application SHALL be installable as a PWA with a manifest, application icons, HTTPS service worker and clear online/offline status; a successful install SHALL NOT be a prerequisite for ordinary browser use.
- **MOB-005 (P1):** Native iOS/Android distribution SHALL be a separate release gate; platform-specific capabilities SHALL be isolated behind adapters, and mobile apps SHALL use the same backend contracts as the PWA.

## Parent mobile experience

- **MOB-006 (P0):** Authenticated parents SHALL follow and unfollow favorite teams and permitted players using stable IDs, and SHALL be able to access schedules, game trackers and reports for those favorites.
- **MOB-007 (P0):** Live views SHALL reconnect without duplicate plays, display data-staleness indicators, and keep the full actual score regardless of arena mercy-score caps.
- **MOB-008 (P1):** Parents SHALL independently opt into game start, schedule change, provisional final, certified result and corrected-result alerts; channels and quiet hours SHALL be configurable.
- **MOB-009 (P0):** Youth privacy policy SHALL govern public player names, statistics and profile visibility; favoriting a player SHALL NOT grant otherwise restricted access.
- **MOB-010 (P1):** Mobile users SHALL view, share and download the attractive unofficial and certified end-of-game report with clear status and revision labels.

## Manager mobile experience

- **MOB-011 (P0):** A manager SHALL view and edit only teams explicitly assigned to their authenticated account; permission enforcement SHALL occur on the server for every write.
- **MOB-012 (P0):** Game-day lineup confirmation SHALL record actor identity, game ID, roster revision, selected eligible players, coaching staff, time, and audit event ID; edits after confirmation SHALL use an authorized amendment workflow.
- **MOB-013 (P0):** Managers SHALL complete configurable league-specific exhibition, tournament and regular-season checklists, with due dates, evidence, completion actor and immutable history.
- **MOB-014 (P1):** Managers SHALL photograph or select a scoresheet, preview/crop it, and upload it through an authenticated, size-limited, malware-scanned, access-controlled endpoint; upload receipts and revision history SHALL be retained.
- **MOB-015 (P1):** Offline-capable manager drafts SHALL use a durable local queue and require server acknowledgment, idempotency, conflict detection and explicit retry; queued evidence SHALL NOT be displayed as submitted until acknowledged.
- **MOB-016 (P0):** Referee/coach approval and signing SHALL require verified, role-appropriate identity and bind approval to the exact document/scoresheet revision; local unsigned drafts SHALL NOT certify a game.

## Identity, security, accessibility and reliability

- **MOB-017 (P0):** IceBreaker SHALL support its first-party email/password identity and optional Google OpenID Connect on mobile without leaking secrets or authentication tokens to public caches.
- **MOB-018 (P0):** Sessions SHALL support logout and revocation, CSRF and authorization protection, and platform-appropriate secure cookie or credential handling.
- **MOB-019 (P0):** Personally identifying youth data, credential responses, and manager evidence SHALL NOT be cached in a shared/public service-worker cache; local drafts SHALL use least-data retention and clearing controls.
- **MOB-020 (P1):** Interactive controls SHALL support touch targets, keyboard and screen reader use; accessibility SHALL be tested to WCAG 2.2 AA objectives.
- **MOB-021 (P0):** Critical remote writes SHALL be idempotent, have user-visible pending/success/failure states, and be logged in the central audit chain.

## Acceptance tests and traceability

| Scenario ID | Required behavior | Requirements |
|---|---|---|
| MOB-T01 | On a narrow mobile viewport, parent opens full-score live game with goal/shot/penalty feed | 001,003,007 |
| MOB-T02 | Disconnect mobile network mid-game; reconnect and receive exactly once, with stale badge in between | 007,021 |
| MOB-T03 | Follow team, relogin on second device, favorites persist; restricted youth profile stays restricted | 006,009 |
| MOB-T04 | Manager from Team A attempts Team B roster update; HTTP authorization denies and writes zero rows | 002,011,018 |
| MOB-T05 | Manager confirms lineup, then tries late edit; amendment approval and audit required | 012,016,021 |
| MOB-T06 | Take scoresheet photo, upload; reject unsafe file, store receipt, enforce team-only access | 014,019 |
| MOB-T07 | Offline manager checklist edits queued; retry twice; exactly one accepted server mutation | 013,015,021 |
| MOB-T08 | Parent opts out of notifications; no outgoing delivery; preference persists | 008 |
| MOB-T09 | User signs out; protected responses and cached drafts cannot be viewed by another user | 017,018,019 |
| MOB-T10 | Player sport capability changes; shared mobile API works without hockey-specific interpretation | 003,005 |

## Implementation gates

**Now:** Responsive parent and manager web prototypes exist, but PWA, real mobile push, camera uploads, hardened offline manager writes, and app-store packages have NOT been completed.

**First release:** MOB-001/002/003/006/007/009/011/012/013/016/017/018/019/021 verified with integration and mobile-browser E2E tests.

**Subsequent delivery:** PWA installation, notification delivery, scoresheet photo handling, and offline manager drafts after the relevant security tests pass.

**Native stores:** iOS/Android releases only after verified device tests, signing/release automation, store privacy disclosures, and push provider configuration.
