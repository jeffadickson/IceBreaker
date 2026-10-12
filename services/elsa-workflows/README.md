# IceBreaker Elsa 3 integration (development adapter)

Elsa **3.8.0** is hosted here in an ASP.NET Core service. The external bridge accepts authenticated workflow transition notifications and executes a real Elsa `Sequence` workflow. The Node authority **remains the source of truth** for game events, authorization, document digests and signing; Elsa must never certify or change a score directly.

## Setup

Install .NET SDK 8 or newer. From `services/elsa-workflows`:

```powershell
$env:ICEBREAKER_ELSA_BRIDGE_KEY = '<set-a-random-secret-at-least-32-characters>'
dotnet restore
dotnet run --urls http://127.0.0.1:8094
```

The bridge endpoint is `POST /api/icebreaker/workflow-events` with `X-IceBreaker-Workflow-Key` and JSON fields `eventId, gameId, action, revision, definitionDigest, state`. Health check is `GET /healthz`.

The bridge is **NOT internet-ready**. Run behind TLS and a private network or same-host loopback, use secret rotation and restrict ingress. Never use demo keys in production.

## Integration and boundaries

The existing Node workflow interpreter continues to validate and commit transitions in SQLite. `services/elsa-workflows/bridge-outbox.js` adds a transactional delivery queue for Elsa notification, which a worker retries. This is **real Elsa invocation**, but *not yet* a full migration of state orchestration to Elsa; the Elsa workflow currently logs accepted notifications. A further milestone must replace the logging activity with Elsa bookmarks, persistent workflow instances, branching approvals, scheduled reminders and a visual designer. The Elsa host now configures EF Core SQLite management/runtime persistence and a durable receipt inbox. A one-minute in-progress lease allows retry after host failure, but execution is not transactionally atomic with receiver receipts; therefore activity side effects must remain idempotent. Elsa currently observes workflow events, while IceBreaker still enforces referee approvals.

## Verify

```powershell
node --test tests/integration/elsa-bridge.test.js
dotnet build services/elsa-workflows/IceBreaker.Elsa.csproj
```

The JavaScript tests exercise enqueue/claim/delivery/error/restart with a simulated HTTP receiver. They **do not** prove the Elsa host compiles or executes; that requires .NET SDK and NuGet access.

## Sources

- https://www.elsaworkflows.io/get-started/elsa-server
- https://docs.elsaworkflows.io/getting-started/hello-world

## Demonstration and release gates

See [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) and [public demonstration readiness](../../docs/DEMO_RELEASE_GATES.md). GitHub CI now compiles the Elsa service separately; a .NET build has not been run in this execution container.