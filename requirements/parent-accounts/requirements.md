# Parent Identity and Preferences — requirements v1.2

| ID | Priority | Requirement | Automated verification |
|---|---|---|---|
| AUTH-001 | P0 | Register parent account with unique normalized email and salted memory-hard password hash; prohibit login before verification. | parent-auth.test.js registration + verification |
| AUTH-002 | P0 | Generate single-use, short-lived email-verification tokens stored only as hashes; never expose token in API registration response. | parent-auth.test.js verification |
| AUTH-003 | P0 | Authenticate with server-side random, expiring, HttpOnly, SameSite sessions; logout revokes session. | parent-auth.test.js session lifecycle |
| AUTH-004 | P0 | Offer Google OIDC authorization-code + PKCE, validating ID-token signature, issuer, audience, expiry, nonce, and verified email. | Google integration test pending configured credentials |
| AUTH-005 | P0 | Account linking shall require independently authenticated proof for both identities; a matching email alone shall not merge accounts. | Existing email rejects new Google link; E2E pending |
| AUTH-006 | P0 | Throttle credential attempts and reject cross-origin state mutations. | parent-auth.test.js |
| AUTH-007 | P0 | Provide verified transactional mail delivery, retry, suppression and delivery status visibility before production release. | **Not implemented**: SQLite outbox only |
| AUTH-008 | P0 | Password reset, account deletion, consent and parental-privacy workflows required before public release. | **Not implemented** |
| FAVOR-001 | P0 | Authenticated parents can save/remove favorite teams and players by stable opaque IDs. | parent-auth.test.js |
| FAVOR-002 | P0 | Public favorite selection must never elevate access to nonpublic minor information. | Permissions policy / integration pending |
| MAIL-001 | P0 | Parent can select reports at certification, daily digest or none; preference defaults to certified. | parent-auth.test.js |
| MAIL-002 | P0 | Certification report is derived from signed/certified snapshot; pending corrections produce revision notice. | **Not implemented** |
| MAIL-003 | P0 | Opt-out, unsubscribe and delivery suppression must be enforced before sending. | **Not implemented** |

## Current delivery boundary

Implemented: local registration, verification-token generation, login/logout, Google OIDC backend, favorites, and email preferences.

Not implemented: actual outbound email delivery, Google live flow tested with real credentials, account recovery, permissioned association between a child and guardian, reports, unsubscribe, hosted deployment, formal privacy review. **Do not expose the development service to the public internet.**
