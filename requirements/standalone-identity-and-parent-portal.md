# ICEBREAKER standalone identity and parent onboarding requirements

Status: **implementation requirements, P0/P1; not production accepted**. Architecture: [ADR-003](../docs/architecture/adr-003-standalone-identity-and-parent-onboarding.md). Tracking: #12 and #13.

## Identity and authentication

| ID | Priority | Requirement | Verification |
|---|---|---|---|
| ID-001 | P0 | Authenticate via standards-compliant OIDC authorization-code flow with PKCE; Google first, extensible provider registry | Mock OIDC integration: signature, issuer, audience, nonce, state, expiry, code verifier |
| ID-002 | P0 | Identify provider accounts by unique immutable issuer and subject, never by email alone | Same-email/different-subject and changed-email tests |
| ID-003 | P0 | Provision local user and PARENT grant transactionally and idempotently on first verified sign-in | Concurrent duplicate callback tests |
| ID-004 | P0 | New PARENT grants allow only basic own-account actions; no league, child, roster or document access until independently approved | Unauthorized child access denied |
| ID-005 | P0 | Server sessions use Secure, HttpOnly, SameSite cookies, CSRF defenses, expiry, rotation, logout and disablement invalidation | Session fixation, CSRF and revocation tests |
| ID-006 | P0 | Protect login and account endpoints with throttling and security audit without tokens or personal data in logs | Abuse and log-redaction tests |
| ID-007 | P0 | Link additional identity providers only after explicit reauthentication; prevent automatic email-based linking | Account takeover negative tests |

## Superuser and authorization

| ID | Priority | Requirement | Verification |
|---|---|---|---|
| ID-010 | P0 | Exactly one initial PLATFORM_SUPERUSER is provisioned out of band; ordinary APIs cannot create or self-assign the role | Bootstrap and privilege-escalation tests |
| ID-011 | P0 | Superuser requires MFA, privileged action audit and step-up for sensitive operations | Deny without MFA and record audit |
| ID-012 | P0 | Authorization is deny-by-default and scoped to platform/league/team/rink/game/guardian-child relationships | Cross-tenant negative matrix |
| ID-013 | P0 | Role grants and revocations are durable, versioned, attributed to an authorized actor and enforced on every protected endpoint | Revocation and stale-session tests |
| ID-014 | P0 | Human operator identity and device identity are separate; signed short-lived offline game grants cannot be minted by operators | Forgery/expiry/device-mismatch tests |
| ID-015 | P0 | Offline rink remains functional for valid grants during internet outage; expired/revoked grants fail closed without altering clock authority | Two-laptop partition and takeover drill |

## League-branded parent portal

| ID | Priority | Requirement | Verification |
|---|---|---|---|
| ID-020 | P1 | Each league has a stable unique slug and branded signup URL | Slug collision and routing tests |
| ID-021 | P1 | League admins can edit approved logo, color tokens, typography preset, welcome copy, support and policy links | Preview/publish and tenant isolation tests |
| ID-022 | P0 | Configurable content is sanitized and constrained; no arbitrary script, CSS or unsafe redirects | XSS and URL validation tests |
| ID-023 | P1 | Signup is mobile-first, keyboard accessible, screen-reader friendly and WCAG 2.1 AA-oriented | 390px/1366px and accessibility review |
| ID-024 | P0 | League signup automatically grants only PARENT; league membership remains pending until policy-based approval | Privilege and duplicate-signup tests |
| ID-025 | P0 | Guardian-child links require independent relationship and consent verification; never infer from matching email/surname | Unauthorized access and approval audit tests |
| ID-026 | P1 | Theme/content changes support draft preview, audited publish, version history and rollback | Concurrent edit and rollback tests |
| ID-027 | P0 | Public signup remains disabled until identity, consent, privacy, KMS, backup and security gates pass | Deployment gate test |

## Release evidence

No real minors' personal data in development. Required: successful build and unit/integration tests; provider callback security; two-tenant authorization matrix; physical offline rink test; real browser/mobile accessibility review; security review and explicit go/no-go approval. A passing source-contract test does not prove OIDC or production identity safety.
