# M3 — Signed certified-result projection (development pilot)

**Status: implemented source-level contract, receiver and unit tests; NOT installed or validated in a live Frappe v16 Bench. No production cutover.**

## Ownership and trust

- The **rink-local authority** retains clock, score computation, immutable event journal, referee certification, and offline operation.
- The **Frappe league service** receives an authenticated, **read-only projection** of a certified result. It cannot edit the rink journal, issue clock commands, or certify a game.
- The M3 pilot receiver is restricted to **System Manager**, accepts only fictional data and requires a pinned Ed25519 public key. No automatic rink-to-Frappe delivery or production service authentication has been implemented.
- A new `IceBreaker Certified Result` DocType holds immutable revisioned projections; `IceBreaker Game` remains schedule-only.

## Signed envelope v3

The sender signs canonical JSON (UTF-8 ASCII, sorted keys, no whitespace, strict JSON types) of all fields **except** `signature` using Ed25519. The signature is standard base64 of 64 bytes.

| Field | Meaning |
|---|---|
| `schema_version` | Integer 3 |
| `fictional` | Boolean true (development gate) |
| `league_id`, `game_id` | Stable IceBreaker identifiers |
| `revision` | Positive integer, increments by exactly one |
| `home_score`, `away_score` | Nonnegative integers, projection only |
| `journal_sha256` | Lowercase SHA-256 hex digest of authoritative journal |
| `certification_sha256` | Lowercase SHA-256 hex digest of frozen referee certification |
| `issued_at` | Offset-aware UTC ISO-8601 timestamp |
| `issuer`, `key_id` | Trusted certification issuer and pinned key identifier |
| `idempotency_key` | Opaque unique token (not a credential) |
| `signature` | Base64 Ed25519 signature of canonical unsigned fields |

Any unknown field, DOB, name, address, roster, unrecognized issuer, wrong signature, wrong league, invalid score or timestamp is rejected. Public keys live in Frappe **site configuration**, not in the envelope. The signing private key stays in the certification service, never Frappe.

Example site configuration shape (public key only):

```json
{
  "icebreaker_result_public_keys": {
    "rink-dev-1": {
      "issuer": "rink-certification",
      "leagues": ["demo-league"],
      "public_key_base64": "<base64 of 32-byte Ed25519 public key>"
    }
  }
}
```

Do not use a test key in production. In this pilot, a System Manager uses authenticated POST endpoints:

- `/api/method/icebreaker_league.result_receiver.preview_certified_result` — signature and league checks, conflict classification, **no write**.
- `/api/method/icebreaker_league.result_receiver.receive_certified_result` — verify and append a certified projection; no game/journal update.

The result receiver checks that the game belongs to the signed league through the division and season links. It rejects duplicate idempotency keys on different revisions or games. Identical signed revision replay is an unchanged no-op. A different payload at an existing revision is a conflict. Missing/intermediate revisions are rejected as out-of-order; do not silently skip corrections. There is no direct DocType create/write/delete permission, and the controller blocks direct mutation outside the verified receiver.

## OpenTelemetry

`league.result_receive` is already in the operation allowlist. The receiver records only fixed operation and outcome attributes; it does **not** attach scores, player identifiers, key material, digests, signature, body, or SQL to spans. Export is optional and must not block business logic. Logfire remains an optional collector-backed observability backend.

## Acceptance and remaining work

- Pure Ed25519 contract tests cover tampering, unknown fields, wrong keys, UTC enforcement, replay, and revision ordering.
- CI checks Python syntax and runs these tests, but a **live Frappe v16 Bench** must still validate DocType install/migrate, controller immutability, transaction rollback, concurrency, role permissions, and exact-duplicate behavior.
- Implement production mutual authentication or a dedicated narrowly privileged service account, issuer key rotation/revocation, safe replay queue, signed result generation in the rink certification service, and controlled background delivery.
- Signed roster/rules/eligibility snapshots **from** Frappe **to** rink remain a separate M3 deliverable. No scorekeeping logic may depend on the central network.
- No real player or league data may be imported until privacy, security, tenancy and deployment release gates pass.
