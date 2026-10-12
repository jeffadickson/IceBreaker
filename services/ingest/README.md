# Central rink ingestion — development milestone

This component is a **development reference implementation**, not a public-internet-ready service. It receives cryptographically signed rink event batches and stores them in a central SQLite event ledger.

## Endpoints

- `POST /admin/stations` — register station ID and PEM Ed25519 public key (admin key required).
- `POST /admin/assignments` — assign station to game (admin key required).
- `POST /api/ingest/v1/batches` — signed, sequenced rink game events.
- `GET /api/public/v1/games/:gameId` — full public game score, shots, and provisional event timeline.
- `GET /api/public/v1/games/:gameId/events` — SSE snapshot/live stream.
- `GET /health` — liveness.

## Start local central service

```bash
export ICEBREAKER_INGEST_ADMIN_KEY='replace-with-a-long-random-secret'
node services/ingest/central-server.js
```

To provision a station, generate an Ed25519 key pair and POST the public key to `/admin/stations`, then assign its `stationId` to the scheduled `gameId`. Keep the private key on the rink computer, encrypted in production. Do not reuse the admin key as a rink signing key.

A rink can call `new RinkSyncClient({dbPath,remoteUrl,gameId,stationId,privateKey}).flush()` to forward committed `game_events` from its `sync_outbox` table. Call on a timer with bounded exponential backoff and jitter in an application host. A successful response marks only acknowledged events delivered; retries reuse the original IDs. The ingestion server enforces per-game monotonic sequences, assignment, Ed25519 signatures, atomic batch acceptance, and conflicting replay rejection.

## Important boundaries and known limitations

- **No public TLS termination, station enrollment approval UI, credential rotation/revocation workflow, device attestation, authentication throttling, or distributed rate limiting.** Do not expose this directly to the internet.
- **Single active writer per game is required.** Current schema authorizes station IDs against games, but does not yet implement a renewable exclusive lease or leadership-fencing token. Never assign two simultaneously writing stations to one game.
- **Game certification is not implemented here.** An accepted `GAME_ENDED` event is provisional. Referee signature and league certification must run separately.
- **Privacy:** The development spectator projection currently exposes event data. A production projection must explicitly whitelist fields, enforce youth-publication preferences, and redact operator/guardian information before publication.
- **Event schemas:** This ingestion layer verifies sequence and signatures, but does not yet fully validate hockey-domain payloads or resolve correction chains, clock authority, cross-game outbox conflicts, or game locks.
- Existing rink backend does not automatically run the uploader; the `RinkSyncClient` is wired to its SQLite journal/outbox and tested end-to-end, but needs a managed loop and provisioning UI for product use.
- SQLite for Node 22 remains experimental. PostgreSQL is recommended for production central data and multi-instance ingestion.

## Tests

```bash
node --test tests/integration/remote-sync.test.js
```

Tests cover signed uploads, assigned-game access, replay deduplication, sequence gaps, atomicity, persistence/restart, tampering, unauthorized requests, and the actual rink SQLite outbox.
