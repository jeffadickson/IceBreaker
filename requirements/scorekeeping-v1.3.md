# IceBreaker v1.3 proposed requirements (testable)

| ID | Priority | Requirement | Verification |
|---|---|---|---|
| AUTH-020 | P0 | IceBreaker shall offer a first-party identity provider (local email/password with verification and secure sessions) independent of Google OIDC. | Local registration and session tests |
| AUTH-021 | P0 | Google OIDC shall remain an optional federated identity provider; no embedded OAuth secrets. | Provider disable/enable tests |
| SHOT-001 | P0 | Operators shall record saved shots on goal as distinct, append-only team events with confirmation and idempotency; every goal shall automatically count as one shot on goal unless an exception rule is configured. | Shot journal tests |
| SHOT-002 | P0 | Rink and public scoreboards shall display team shots separately from goals. | Projection tests |
| SHOT-003 | P1 | Operators shall correct erroneous shot counts using audited reversing adjustments. | Future test; NOT IMPLEMENTED |
| PEN-020 | P0 | Each penalty event shall carry infraction, classification and duration. | Validation and restart tests |
| PEN-021 | P1 | Clients shall obtain a ranked list of ten frequent penalty infractions with defined data scope and deterministic tie ordering. | HTTP / ranking tests |
| PEN-022 | P1 | League-wide ranking shall aggregate authorized league historical data, not only an individual rink. | NOT IMPLEMENTED; current endpoint rink-scoped |
| REPORT-020 | P0 | A game-ending action shall make a styled UNOFFICIAL report available with goals, assists, penalties, classification, shots, and period data. | Report HTTP tests |
| REPORT-021 | P0 | Unofficial reports shall never imply official certification, nor update certified standings. | Unofficial label tests |
| REPORT-022 | P1 | Final game report shall include shots by period, goalkeeper statistics where recorded, and printable/PDF output. | PARTIAL; print supported, per-period shot summaries planned |
| LOG-020 | P0 | Every confirmed shot, penalty classification, and end-game operation shall be captured in the journal and operator audit, with draft changes recorded separately. | Event and action log tests |

**Current scope limitation:** Parent auth is a first-party identity subsystem within the local Node development service, not yet a separately deployed microservice. Dynamic infraction rankings are presently scoped to the local rink journal (explicit in response), not league-certified history.
