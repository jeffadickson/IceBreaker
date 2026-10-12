# IceBreaker 2.4 — Electronic scoresheet & referee review

Implementation status: **development vertical slice**. The documented API is local-only and must not be publicly exposed before a security review.

## Requirements

- **CERT-020 (P0):** The authoritative event journal SHALL remain unchanged by generating, reviewing or signing a document.
- **CERT-021 (P0):** A provisional scoresheet SHALL be generated only after a `GAME_ENDED` journal event, and SHALL identify its immutable source sequence and SHA-256 document digest.
- **CERT-022 (P0):** The scoresheet SHALL contain full official score, both teams' shots, by-period statistics, goal scorer/assists, and penalties; it SHALL not use the arena mercy display cap.
- **CERT-023 (P0):** Submission SHALL reject unresolved TBD player attribution, with a clear operator error.
- **CERT-024 (P0):** An assigned individual referee SHALL authenticate independently of the rink operator; operator credentials alone SHALL NOT sign or approve the scoresheet.
- **CERT-025 (P0):** Approval SHALL require an explicit affirmative signing statement and SHALL bind the referee ID, decision, timestamp and exact scoresheet digest to an immutable revision.
- **CERT-026 (P0):** Mismatched digests, stale source journal revisions, duplicate approvals and unassigned signers SHALL be rejected without changing certification status.
- **CERT-027 (P0):** Requesting a correction SHALL retain both the request and prior document but SHALL NOT certify the game.
- **CERT-028 (P0):** Signing, submission and provisioning actions SHALL be recorded in the private operational audit log.
- **CERT-029 (P1):** Referees SHALL review and print the scoresheet from a mobile-friendly browser, using a secure individual login.
- **CERT-030 (P0):** Certification rules SHALL be versioned and league configurable; sport-specific document sections SHALL be provided by the sport module, never by the generic approval engine.
- **CERT-031 (P0):** Final certification SHALL produce a durable league result and recalculate standings and player statistics, including audited amendments.
- **CERT-032 (P0):** Printed/PDF form and external league portal submission SHALL remain available where league policy requires hybrid/paper processing.
- **CERT-033 (P1):** Pregame rosters SHALL be confirmed by both authorized team managers and included in the signed document snapshot.

## Implemented in v2.4

CERT-020 through CERT-029 have initial coverage through `server/scoresheet-certification.js`, `web/referee-review.html`, the local API routes and five integration tests. Signing is a **development authentication + approval record**, not a qualified legal e-signature. The scoresheet currently snapshots home/away goals, penalties and shots; it does NOT yet include independent manager confirmations as signature-bound content. It uses `demo`-bound rink authority and a single assigned referee policy.

## Explicit remaining release blockers

CERT-030 through CERT-033 need end-to-end integration. Also required: robust correction/reopen/resubmit procedure, referee password-reset/rate-limits/MFA/session revocation, secure TLS service and CSRF review, external signing policy legal review, renderer-generated PDF with officially accepted templates, second signer as configured, offline signing verification and remote rink-to-league certification integration. The server must remain restricted to localhost.

## Acceptance test mapping

| Test | Scenario | Requirements |
|---|---|---|
| E2E-CERT-01 | Unauthenticated review/sign is denied | 024 |
| E2E-CERT-02 | TBD scorer stops submission | 023 |
| E2E-CERT-03 | Submit and sign exact hash; no re-sign | 020–026,028 |
| E2E-CERT-04 | Referee correction request survives restart and never certifies | 027,028 |
| E2E-CERT-05 | Mobile HTML loads and avoids raw HTML injection | 029 |

## Local development walkthrough

1. Run the rink backend on loopback. Use `POST /api/scoresheet/v1/referees` with `X-Operator-Key` to provision `{ "refereeId":"official-42", "password":"a-long-unique-password", "gameId":"demo" }`.
2. Use operator `/api/operator/command` to record events, resolve TBD attributions and commit `GAME_ENDED`.
3. Submit with `POST /api/scoresheet/v1/submit` and `X-Operator-Key`.
4. Open `/referee-review.html` on the **same development host**. Sign in as the assigned referee and review the document revision and hash.
5. Approve or request correction. Approval is bound to that digest and cannot be replayed as a second signature.

Credentials in these steps are examples; do not reuse in real installations.