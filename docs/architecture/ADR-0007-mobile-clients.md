# ADR-0007 — Shared mobile-first web experience, optional native shells

Status: proposed | Date: 2026-10-12

## Decision
Deliver one mobile-first IceBreaker web client with distinct Parent and Team Manager role-aware journeys. Adapt the existing parent and team routes and central APIs first, then add a PWA manifest/service worker scoped to application shell assets only. Assess Capacitor or another maintained native shell when real requirements demand system camera integration, notification reliability, or store distribution. Do not promise native feature parity before field validation.

## Rationale
* Minimizes divergence among desktop browser, parent phone, team-manager phone, and sport-specific modules.
* Retains existing backend identity providers and team-scoped authorization.
* Keeps official game authority at the rink, never in a mobile phone.
* Enables staged offline checklists without caching sensitive youth data indiscriminately.

## Boundaries
* Rink scorekeeper is not the same as Parent or Manager mobile UI. Mobile manager approvals may be permitted but phone clocks never own official game time.
* Public live data is read-only and remains separate from private operational, identity, and low-level audit APIs.
* Shared libraries enforce transport, roles, revisioning and offline state, while individual sport modules provide terminology and statistics.
* Web push requires explicit permission, platform support and a robust email fallback; no guaranteed delivery claims.
* Google sign-in requires OAuth setup, mobile/browser flow validation and independent security review.

## Open decisions
Choose whether future app-store distribution uses a PWA wrapper or dedicated cross-platform application after usability testing on iOS Safari and Android Chrome. Choose push/email vendor only after opt-in and deliverability review.

## Verification
See `requirements/mobile-apps.md` test matrix MOB-T01 through MOB-T10. No automated mobile implementation tests are claimed by this decision record.
