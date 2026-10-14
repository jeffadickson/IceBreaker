# IceBreaker STRIDE threat model and security risk register

**Status:** Initial systematic review, 2026-10-13. **NOT a security certification or production approval.** Maintained as architecture and code change. See [Microsoft STRIDE](https://learn.microsoft.com/en-us/archive/msdn-magazine/2006/november/uncover-security-design-flaws-using-the-stride-approach) for the method.

## Scope and assets

Assets: authoritative game clock and event journal, goals/penalties/goalie statistics, referee certification records, family identities and permissions, youth DOB/address/guardian contact details, uploaded documents, training certificates, encryption keys, operator credentials, and backup/restore material.

Actors: timekeeper on rink Windows laptop, backup laptop, referee on phone, club registrar, league administrator, parent/guardian, coach/manager, spectator, registration-email parser, backend worker, and malicious network/local user.

### Trust-boundary diagram

```text
[Timekeeper desktop] --operator commands--> [Rink local HTTP authority] --> [SQLite event journal]
       |                                            |
       |                                  spectator-only projections
       |                                            v
[Backup laptop] --authenticated takeover--> [Public scoreboard / mobile spectators]

[Referee phone] --individual sign-in--> [Scoresheet revision + approval API]
                                              |
                                       [immutable event source]

[Parent / Club / League browser] --role-scoped sessions--> [Registration service]
                                                             |
                                            +----------------+---------------+
                                            |                                |
                                    [Private registry DB]          [Encrypted document vault]
                                            |                                |
                                    [key environment]               [KEK + ClamAV worker]

[Untrusted certificate email parser] --> [PENDING intake queue] --> [human review] --> [training ledger]
```

**Current architecture caveat:** The local development service shares database/runtime components with registration. The separate central registration service and production key isolation shown as conceptual boundaries are **not yet deployed**. The local HTTP service must not be exposed publicly.

## Risk ratings

Critical: exploitable path to widespread youth PII or unauthorized certified game changes. High: major confidentiality, integrity, or availability risk; production blocker. Medium: significant but bounded or requires extra preconditions. Low: narrow impact. Statuses: OPEN, PARTIAL, TESTED (narrow mitigation verified), NOT APPLICABLE. **TESTED never means all attack paths are eliminated.**

| ID | STRIDE | Threat scenario and boundary | Impact | Existing mitigation / evidence | Residual risk and next action | Status |
|---|---|---|---|---|---|---|
| S-01 | Spoofing | Shared operator key allows an unauthorized holder to impersonate any timekeeper; `X-Operator-Id` is client supplied | Critical | Timing-safe key comparison, localhost default, journal actor and idempotency; `rink-server.js`, `RinkClockClient.cs` | Per-device identity, certificate/credential rotation, signed operator sessions and authenticated actor binding | OPEN |
| S-02 | Spoofing | Referee, family, or registrar password guessing | High | Password hashing, scoped sessions, new bounded per-IP/account login throttle; `login-throttle.js`, `stride-security.test.js` | Distributed limiter, MFA enforcement, secure recovery, anomaly alerts, test against credential stuffing | PARTIAL |
| S-03 | Spoofing | Spoofed registration email claims a SafeSport completion | High | `training-intake.js` only stages PENDING; human review creates verified completion | Issuer verification, secure attachment linkage, independent identity reconciliation | PARTIAL |
| T-01 | Tampering | Operator edits already committed goal/assist/penalty | High | Append-only event journal, audited goal-attribution corrections with original event ID and reason; `authority-sqlite.js`, `scoresheet-certification.js` | Implement tested reversal/amendment commands for penalties and goals, prevent score manipulation | PARTIAL |
| T-02 | Tampering | Attacker modifies local SQLite, backups, or device during takeover | Critical | Event sequence/idempotency and signed takeover flow | Independent journal integrity verification, secure boot, device trust, signed restore validation and recovery drill | PARTIAL |
| T-03 | Tampering | Alter encrypted document or swap it to another player | High | AES-GCM tags, AAD bound to player/document/type, per-document DEKs; `encrypted-documents.js` | KMS, key lifecycle, storage isolation, independent fuzzing | PARTIAL |
| R-01 | Repudiation | Timekeeper disputes a goal correction, clock adjustment, or certified result | High | Journal audit, correction reasons, referee digest/revision approval | Authenticated individual operator identity, tamper-evident external audit retention and trustworthy timestamps | PARTIAL |
| R-02 | Repudiation | Referee denies signing a scoresheet | High | Individual referee session, signing intent, exact revision and SHA-256 digest; `scoresheet-certification.js` | MFA/passkeys, independent signature verification, legal/policy review, multi-official signing | PARTIAL |
| I-01 | Information disclosure | Club/parent accesses unrelated child's DOB, address or document | Critical | Club/league scope and verified guardian grants, cross-scope tests, private profile access audit | Independent authorization penetration test, consent/custody verification, central DB isolation | PARTIAL |
| I-02 | Information disclosure | Stolen database or local key environment reveals PII | Critical | Optional field encryption, document envelope encryption, offline migration tooling | Enforce full migration, protect indexed emails, KMS/HSM, encrypted backup/restore, secret scanning | OPEN |
| I-03 | Information disclosure | Scores/PA/spectator feed leaks sensitive registration information | High | Game event sync deliberately excludes private profiles; public score projections | Contract tests for every new endpoint, log and telemetry review | PARTIAL |
| D-01 | Denial of service | Login brute force, request floods or oversized uploads exhaust local service | High | New in-memory login throttling; bounded JSON/document upload sizes | Distributed limits, backpressure, HTTP connection timeouts, abuse monitoring and load tests | PARTIAL |
| D-02 | Denial of service | UI/browser crash or rink connectivity loss stops official clock or loses events | High | Independent rink authority, SQLite persistence, Windows native client, recovery workflow | Dual-laptop full-game fault injection, backup takeover drill and clock recovery acceptance | PARTIAL |
| E-01 | Elevation of privilege | Manager/timekeeper gains league approval or private document access | Critical | Scoped registrar/league sessions, restricted document APIs, authorization tests | Formal least-privilege review of all endpoints and identity/device roles | PARTIAL |
| E-02 | Elevation of privilege | Untrusted email parser or local admin CLI marks a certificate verified | High | Parser only stages PENDING, production CLI disabled, explicit review gate | Authenticated service-to-service ingest, verified reviewer identity, audit monitoring | PARTIAL |
| E-03 | Elevation of privilege | Stale parent/club association retains access after transfer or custody change | Critical | Revocable guardian grants and former-club unlink audit | Verified legal/custody workflow, session revocation and live-access race tests | PARTIAL |

## STRIDE verification matrix

| Boundary | Test or evidence | Result |
|---|---|---|
| Operator command without key | `stride-security.test.js` | Automated negative test |
| Referee review without session | `stride-security.test.js`, `scoresheet-certification.test.js` | Automated negative test |
| Referee login throttling | `stride-security.test.js` | Automated negative test |
| Registrar/family login throttling | `stride-security.test.js` | Automated negative test |
| Duplicate/changed scoresheet revision | `scoresheet-certification.test.js`, `referee-mobile-signing-ui.test.js` | Automated tests |
| Guardian document cross-scope read | `private-documents.test.js`, `private-documents-http.test.js` | Automated tests |
| Document ciphertext tamper and KEK loss | `private-documents.test.js` | Automated tests |
| Training import verification bypass | `training-intake-cli.test.js` | Automated tests |
| Physical laptop compromise and restore | Windows desktop CI, backup-laptop tests | **Field test still required** |
| Actual external KMS, scanner and backup recovery | Security design requirements | **Not yet acceptance tested** |

## Highest-priority work

1. **P0 S-01/R-01:** Replace shared operator key and spoofable operator header with individually provisioned, revocable device/operator identities. Do not claim individual nonrepudiation until then.
2. **P0 I-01/I-02/E-03:** Move youth PII and document vault to central service; enforce encrypted private fields, KMS, verified guardian consent and role-scoped authorization.
3. **P0 T-02/D-02:** Perform dual-Windows-laptop takeover and restart tests during a complete simulated game, with clock and event-journal integrity checks.
4. **P0 R-02:** Strengthen referee identity and signing, define league-specific signer policy and preserve revision history.
5. **P1 D-01:** Add distributed rate limits, timeouts and resource quotas for production; local in-memory throttle is defense in depth only.
6. **P1 T-01:** Complete explicit audited penalty/shot/goal reversal workflows with server-side rules and signed scoresheet amendments.

## Change control

Every new public endpoint, role, device flow, document field, signing action or external integration must update this register, its trust boundaries, test coverage, and release gates. A CI pass demonstrates the included tests ran; it does not constitute a penetration test. **Do not upload real minors' records or expose the development service to the Internet.**

## Frappe central-league boundary — M2 review

The central Frappe app is a **new trust boundary** and requires independent STRIDE validation before cutover:

| STRIDE | New Frappe attack path | Required verification |
|---|---|---|
| Spoofing | Stolen League Admin session or forged sync client | MFA, device/service authentication and token rotation |
| Tampering | Cross-league schedule edits, forged roster snapshots or certified results | Explicit tenant permission checks, signed envelopes, revision and digest checks |
| Repudiation | Admin denies schedule/policy change | Individual actor audit, append-only change history, reliable timestamps |
| Information disclosure | Generic DocType REST, link search, reports, exports or file attachments leak another league or youth PII | Two-tenant negative tests across every access path; no private documents in Frappe |
| Denial of service | Frappe, database or OTel Collector outage interrupts game | Offline rink authority; cached signed snapshots; exporter failure injection |
| Elevation of privilege | Whitelisted method or `get_all` bypasses Frappe DocType permissions | Explicit league membership scope, `has_permission` and query condition integration tests |

Existing source-level tests do **not** establish these release gates. See `docs/architecture/frappe-central-league-design.md`. No real minors' data in Frappe during the development pilot.
