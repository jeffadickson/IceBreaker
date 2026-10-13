# IceBreaker — Multi-Rink Offline Synchronization and Ownership Fencing

## Implementation milestone

The rink-local timekeeper writes each game command into an append-only SQLite `game_events` journal and a transactional `sync_outbox`. The [rink sync client](../../../../services/ingest/rink-sync-client.js) uploads signed batches to the [central ingest service](../../../../services/ingest/central-server.js). Only a positively acknowledged event is marked delivered.

**One writer per game:** the central service stores a game owner (station ID) and a monotonically increasing **ownership epoch**. A league administrator must explicitly transfer a game between laptops. Signed batches now carry the epoch, and a client from an earlier epoch cannot upload even if the game is subsequently transferred back to that same laptop. Older clients without an epoch are accepted only in epoch 1 for compatibility.

### Verified scenarios

- Rink A records a goalie change, shots, a penalty and a goal while the network is unavailable. The journal and outbox remain durable. Reconnection uploads each event exactly once.
- If a server accepts events but the acknowledgment is lost, retrying the identical signed batch is idempotent. Conflicting replays are rejected.
- Rink B cannot publish while Rink A owns the game. A transfer increments the epoch and fences Rink A.
- If Rink B's locally recorded history diverges from the central journal, its upload fails with a conflict. The system does **not** merge two scoresheets.
- Transferring ownership back to Rink A does not authorize its old epoch-1 client; a newly authorized epoch-3 client is required.
- Central events include goalie substitutions, delayed penalties, clock synchronization and timeout events in the signed-event allowlist.

Run the tests:

```bash
node --test tests/integration/multi-rink-offline.test.js
node --test tests/integration/remote-sync.test.js
```

Both suites are included in GitHub CI alongside the local backend tests.

## Recovery boundary

**This milestone implements fencing and fail-closed conflict detection, not unattended hot standby.** A backup laptop cannot safely take over an active game merely by receiving a new epoch. Before recording a new event, it must restore a **verified, complete authoritative journal** with the exact timing policy, team mapping and sequence, and the operator must explicitly acknowledge the handoff. This verified handoff/rehydration workflow is the next task. Never reset the sequence or overwrite the central journal to make a conflicting laptop appear synchronized.

The existing central server is a development reference implementation. It must run behind TLS and authenticated administrative controls in production. The station private keys and admin secrets must be protected, and production should use short-lived station leases, authenticated recovery snapshots, signed handoff manifests, operator-visible ownership indicators, backup/restore testing, and a tamper-evident event chain.

## Data consistency invariants

1. `game_events(game_id, seq)` is monotonic and unique.
2. Every accepted event ID is unique for the game; duplicate retransmissions must have the same ID, sequence, payload and station.
3. No outbox event is acknowledged locally before the central server accepts or recognizes it as an identical duplicate.
4. Only the station owning the current epoch may publish; ownership transfers are audited.
5. Conflicting histories produce a visible error and require explicit human/administrator reconciliation.
6. Certified scoresheets and official league standings are separate from provisional live-event synchronization; a live sync acknowledgment is **not** referee certification.

## Verified backup-laptop handoff (development implementation)

The two-phase handoff is implemented in [`verified-handoff.js`](verified-handoff.js). It requires an authorized administrator, a registered station keypair, a **pinned game timing policy**, a stopped clock, and a standby SQLite database with **no pre-existing journal**.

1. The administrator pins the exact rules/version using `POST /admin/games/policy`. The policy cannot be silently changed.
2. `POST /admin/games/prepare-handoff` returns the complete central event journal, current owner epoch, pinned rules, a SHA-256 digest, and an HMAC-authenticated manifest.
3. The standby verifies the signature, event-by-event SHA-256 digests, contiguous sequences, game ID, clock/period data, and projected state. It compares the signed timing policy with its local pinned policy.
4. An operator explicitly confirms the intended game, event count, period, clock and goalies. The standby restores the journal transactionally, marking recovered events already delivered. An existing divergent journal is rejected.
5. The standby signs a restoration receipt with its Ed25519 station key. `POST /admin/games/commit-handoff` validates the receipt, the prepared manifest, and the unchanged central journal **inside the ownership transfer transaction**, then increments the epoch.
6. The restored laptop must close and reopen its `Authority` instance to project the newly restored journal. Only then may it create new events and synchronize with its new epoch. The old laptop is fenced by central ingestion.

For a development test, run:

```bash
node --test tests/integration/verified-handoff.test.js
```

The tests include success with goalie/penalty/clock restoration, explicit operator refusal, tampered manifest, divergent standby, changed journal after preparation, and refusal of legacy direct transfer for pinned games.

**Limitations:** This is a development implementation, not a fully secured deployment. The HMAC verification currently shares the development admin secret with the recovery client; production must use a dedicated asymmetric central signing key, an authenticated administrative control plane, station-bound recovery authorization and TLS. The station-signed receipt attests to software completion but does not provide hardware attestation. The current `/admin/games/transfer` route remains for legacy unpinned games; all production games must require the verified handoff protocol. A failed commit after local restoration requires operator-led retry/reconciliation. Unsent events on the original laptop are **not** present in the central manifest and must be resolved before handoff.
