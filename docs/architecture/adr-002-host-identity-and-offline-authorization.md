# ADR-002: Frappe-hosted identity and scoped offline rink authorization

**Status:** Accepted architecture; implementation and live Bench validation pending (2026-10-14).
**Related:** #11, #4, #6, #9; ADR-001.

## Decision

Reuse **Frappe v16's built-in User, login, password reset, account disablement, roles, and supported 2FA/session facilities**. Do not implement password hashing, recovery tokens, social login, or a custom identity provider in IceBreaker. User registration and password recovery use Frappe-supported routes and settings, subject to verified email configuration and security policy.

Use an IceBreaker-specific, deny-by-default **authorization policy** for scoped league/team/game operations. Frappe roles alone do not grant cross-tenant access. All API endpoints enforce server-side membership, tenant, resource and action checks. No public or self-service registration automatically grants coach, registrar, referee, or administrator privileges.

Keep the rink Node/SQLite authority independent of Frappe availability. The rink does not store passwords or authenticate directly against a remote service for every command. A future trusted issuer will create short-lived, device- and game-bound signed operator grants after central authentication and authorization. The local authority verifies issuer, audience, subject, role, game, device, not-before/expiry, monotonically increasing grant/revocation epoch and station ownership fencing. No operator may mint their own grant.

## Account workflows

1. **Parents:** Frappe-supported sign-up (if enabled), email verification and password recovery. Link a guardian to a child **only** after separate verified consent/relationship checks in the protected family service. Never expose minors' PII through generic Frappe User/DocType APIs.
2. **Coaches, managers, registrars and referees:** invitation/provisioning by an authorized league administrator, with scoped membership and audited changes. Referee assignment is per game; certification cannot be approved with the scorekeeper's identity.
3. **League admins:** privileged provisioning, role changes, access revocation and MFA; cannot grant themselves unrestricted System Manager privileges.
4. **Operators:** central sign-in before a shift; explicit assignment to rink/game/device; local UI lock/switch user; signed offline authorization expires after a bounded interval. A device certificate is not a human identity.

## Security invariants

- No client-supplied role, team ID or league ID is trusted without server-side authorization.
- User disablement and membership revocation invalidate online sessions and future offline grants. During a partition, already-issued offline grants remain valid only until their bounded expiry; emergency paper fallback is required.
- Rink command audit includes stable actor ID, device ID, grant identifier/epoch, scope, command idempotency key and game journal revision. No passwords, tokens, private youth records or document bodies in logs.
- Cross-league access, generic REST, link autocomplete, reports, exports, permission query conditions and per-document access require live two-tenant Bench tests.
- Never let identity service, telemetry or central database outages alter official clock time or erase journal events.
- Avoid custom Casbin or OpenFGA deployment until an explicit complexity threshold is demonstrated; first implement narrowly scoped authorization rules in the existing Frappe app and Node service.

## Implementation phases

- [ ] ID-01: Validate Frappe v16 account creation, invitations, email verification, password change/reset, MFA and account disablement in disposable Bench with test SMTP.
- [ ] ID-02: Add scoped User-to-league/team/game role membership DocTypes and permission checks; deny cross-tenant access.
- [ ] ID-03: Add secure account admin pages using Frappe's standard user-management screens, with only minimal IceBreaker membership views.
- [ ] ID-04: Define signed offline grant contract and key lifecycle, independent device enrollment, grant expiry and revocation policy.
- [ ] ID-05: Replace development shared operator key and add operator sign-in/lock/switch UI, plus audited per-command checks.
- [ ] ID-06: Exercise disconnected game, revoked operator, expired grant, stolen token, station takeover and multi-referee certification tests.
- [ ] ID-07: Record build-bound evidence and independent security review; no production deployment until all P0 security gates pass.

## Deployment restrictions

The current rink development key and existing login prototypes remain **development-only**. Do not turn on public self-registration or use real minors' personal data until consent, MFA, KMS, session security, secure backups and permission testing have passed. This ADR is not evidence that Frappe Bench has been installed or that offline grants have been implemented.
