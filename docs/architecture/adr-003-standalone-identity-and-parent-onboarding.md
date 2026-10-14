# ADR-003: Standalone identity and branded parent onboarding

**Status:** Proposed architecture, approved direction; implementation pending (2026-10-14). Supersedes ADR-002's choice of Frappe as the identity authority; does not change the Frappe administration migration or rink clock authority.

## Decision
- ICEBREAKER identity is independent of Frappe and hosted in the existing Node.js service boundary, with a central PostgreSQL user/grant store when provisioned. Never store provider passwords.
- Use standards-based OpenID Connect for Google first, then Microsoft/Apple. Validate issuer, audience, nonce, state, signature, expiry and PKCE authorization code flow; identify external accounts by immutable `(issuer, subject)`, **not email address**.
- Keep an optional local login fallback only if a mature, audited password/session library is adopted; do not write custom password or recovery cryptography.
- Issue first-party server sessions using Secure, HttpOnly, SameSite cookies, CSRF protection and rotation. No authorization based on a browser-supplied role.
- Permissions are separate from identity: deny-by-default grants with `user_id, role, scope_type, scope_id, granted_by, created_at, revoked_at, version`. Support platform, league, team, rink, game and verified guardian-child scopes. All resource checks enforce tenant ownership.
- **PLATFORM_SUPERUSER**: provision only by a documented out-of-band bootstrap/recovery procedure; mandatory phishing-resistant MFA where available, short sessions, detailed privileged audit, no self-grant, no ordinary admin creation. Superuser bypasses routine administrative policy but does not bypass cryptographic audit, secret encryption, or game-journal integrity. Require step-up and reason for sensitive actions.
- Parent signup: on successful verified OIDC sign-in create a minimal user and automatically grant the global `PARENT` role, without child access or privileged league roles. Joining a league requires league-specific invitation/registration policy. Guardian-to-child access requires independent relationship verification and consent; never auto-link by surname, email, or claimed child identity.
- League-branding: immutable league slug, approved logo, name, theme tokens (color, typography presets), welcome copy, support contact, consent policy links and configurable optional signup questions. Sanitize copy and URLs, prohibit executable HTML/JS/CSS injection, and preserve accessibility contrast and platform safety messaging. A preview and publish workflow with versioned changes is required.
- Offline rink: trusted central issuer signs short-lived game/device/operator scoped capabilities; rink verifies them locally. A central identity outage never changes official clock time. Expiry and revocation behavior must be tested.

## Suggested central tables
`users(id, status, display_name, created_at)`
`external_identities(id, user_id, issuer, subject, verified_email, linked_at)` unique(issuer,subject)
`role_grants(id, user_id, role, scope_type, scope_id, granted_by, revoked_at, version)`
`league_memberships(user_id, league_id, status, joined_at)`
`guardian_links(user_id, player_id, verification_status, verified_by, verified_at)`
`league_signup_themes(league_id, revision, slug, logo_asset_id, theme_json, content_json, published_at)`
`security_audit(id, actor_id, action, target_type, target_id, scope_id, decision, created_at)`
All private data, sessions, and provider credentials require appropriate encryption, access controls and retention policies.

## Implementation acceptance
- [ ] Node OIDC callback/session with Google, mocked provider integration tests and replay/state/nonce rejection.
- [ ] Transactional first-login user provisioning and automatic unprivileged PARENT grant, idempotent on repeated login.
- [ ] One-time superuser bootstrap, recovery and MFA with no API self-escalation.
- [ ] Scoped authorization middleware and cross-league negative tests.
- [ ] Parent signup UI responsive at 390px, accessible, branded from allowlisted theme tokens, with preview/publish.
- [ ] Guardian verification workflow and no access before verification.
- [ ] Audit, rate limiting, CSRF, secure cookies, account disablement and revocation tests.
- [ ] Signed offline operator grant issuer and verification tests; no live game requires central identity uptime.
- [ ] Build-bound security evidence and approval before real families or production use.

## Non-goals
Do not use Frappe User as the ICEBREAKER identity authority. Do not migrate real minors' private data into the development system. Do not turn on public signup until security review and consent requirements pass.
