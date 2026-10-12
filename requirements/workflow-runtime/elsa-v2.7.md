# WFE — Elsa integration v2.7

**WFE-001 (P0):** Every accepted scoresheet workflow transition SHALL atomically enqueue a stable-ID Elsa orchestration event in the same SQLite transaction as its workflow-history record.

**WFE-002 (P0):** The bridge SHALL authenticate requests to the separately deployed Elsa service, allow HTTPS or loopback transport only, and never send direct scoring credentials.

**WFE-003 (P0):** Worker retries SHALL be idempotent; a rejected/failed request SHALL remain queued and SHALL NOT affect the already-committed official game record.

**WFE-004 (P0):** Elsa activities SHALL NOT directly modify scores, corrections, signatures or league certification state. Authority always belongs to IceBreaker.

**WFE-005 (P1):** A durable Elsa inbox, persistence, version-pinned workflow instances, bookmarks, timeout escalation and visual designer SHALL be delivered before replacing the existing JSON runtime.

**WFE-006 (P0):** The release SHALL have passing .NET compilation and runtime tests plus restart, duplicate delivery and recovery verification before the Elsa bridge is used in production.

## Current implementation boundary

Node.js v2.6 remains the authoritative scoresheet workflow runner. Elsa 3.8 is now *invoked* for committed transitions, with a separate ASP.NET Core host and durable SQLite delivery outbox. The Elsa activity is a real `Sequence`/`WriteLine` execution, **not yet a full orchestration migration**. The Elsa inbox is process-local and should be replaced by persistent deduplication before production.

## Verification

- `tests/integration/elsa-bridge.test.js`: four green tests of durable outbox and transport checks.
- Existing scoring workflow tests must remain green.
- `dotnet build services/elsa-workflows/IceBreaker.Elsa.csproj`: required, but cannot be run in the present environment without a .NET SDK.