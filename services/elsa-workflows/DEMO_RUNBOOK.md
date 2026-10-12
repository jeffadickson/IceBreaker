# IceBreaker + Elsa demo runbook — v2.8

**Scope:** Internal/stakeholder demonstration only; not a public, production deployment.

## Elsa 3.8 prerequisites

* .NET 8 SDK and Node.js >= 22.13, local clone of IceBreaker.
* NuGet network access, Windows or Linux developer workstation.
* Random 32+ character bridge secret stored in environment or secret manager (never Git).
* Bind services to `127.0.0.1`; do not open Elsa endpoints to the internet.

## Launch

From repository root, in one terminal:

```powershell
$env:ICEBREAKER_ELSA_BRIDGE_KEY = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$env:ICEBREAKER_ELSA_INBOX_DB = Join-Path (Get-Location) 'elsa-receipts.sqlite'
# NOTE: Copy the generated secret into the Node worker terminal without writing it into Git.
dotnet restore services/elsa-workflows/IceBreaker.Elsa.csproj
dotnet run --project services/elsa-workflows/IceBreaker.Elsa.csproj --urls http://127.0.0.1:8094
```

The receiver exposes `GET /healthz` and authenticated `POST /api/icebreaker/workflow-events`.
The **Elsa EF Core workflow stores** and a separate durable receipt ledger are enabled. The receiver currently runs a logging activity per transition; it is not the sole approval state authority. A designer/Studio UI is not exposed by this service.

In a second terminal launch the rink server:

```powershell
node apps/rink-local/server/rink-server.js
```

Open `/operator.html`, `/live.html`, `/league.html`, and `/referee-review.html` on `http://127.0.0.1:8090` as appropriate. Provision a referee and end a game before testing scoresheet submission. See `requirements/certification/electronic-scoresheet-v2.4.md` for API prerequisites.

Run the bridge worker from an authenticated local process, setting the same bridge key and endpoint. The bridge code is `services/elsa-workflows/bridge-outbox.js` and is designed to be invoked with the rink SQLite DB object. **No automatic worker start is installed yet**; without a scheduled worker, workflow events remain queued. Do not describe notifications as automatic unless that worker is running.

## Verifications

```powershell
node --test tests/integration/elsa-bridge.test.js
node --test apps/rink-local/tests/browser/*.test.js tests/integration/*.test.js tests/architecture/*.test.js
dotnet build services/elsa-workflows/IceBreaker.Elsa.csproj -c Release
python tools/check_docs.py
```

**Failure injection:** Stop Elsa, commit a scoresheet transition, verify outbox pending; restart Elsa, flush, verify delivered exactly one upstream event and receiver returns duplicate acknowledgment for retransmission. Stop after receipt but before journal acknowledgment and retry. Note that the current receipt ledger only guarantees deduplication for completed receipt rows, not atomic exactly-once Elsa execution.

## Before showing external users

Use fictional rosters and scoring data. Demonstrate the offline scorekeeper first, then full-score spectator display, unofficial report, referee review and audit trail. Show the Elsa host as a **workflow event observer**; the existing IceBreaker JSON/SQLite runtime still determines approval transitions.