# Logfire / OpenTelemetry pilot (opt-in)

This pilot uses the Pydantic Logfire Node.js SDK to verify a safe connection
before instrumenting game workflows. It is **off by default**, and the ordinary
offline rink startup remains unchanged.

## Requirements

- Node.js 24+ for the current Logfire TypeScript/Node.js SDK (IceBreaker's
  current Windows desktop documentation only requires Node 22.13+; do not
  upgrade a rink laptop or replace its runtime just to enable telemetry).
- A Logfire project and a secret ingest token.
- Explicit approval of telemetry collection and outbound network access.

## Try it on a development machine

From the repository root:

```sh
npm install --no-save @pydantic/logfire-node
```

In the shell, set `ICEBREAKER_LOGFIRE_ENABLED=1` and `LOGFIRE_TOKEN` using
your shell's environment/secret mechanism, then run:

```sh
node --require ./apps/rink-local/server/logfire-bootstrap.cjs apps/rink-local/server/rink-server.js
```

On Windows PowerShell, for example:

```powershell
$env:ICEBREAKER_LOGFIRE_ENABLED='1'
$env:LOGFIRE_TOKEN='<set token privately>'
node --require ./apps/rink-local/server/logfire-bootstrap.cjs apps/rink-local/server/rink-server.js
```

Remove `ICEBREAKER_LOGFIRE_ENABLED` to disable the pilot. The runtime and
normal start scripts do not load Logfire by default.

## Scope and privacy

Only a static `telemetry_enabled` event is emitted in this initial pilot.
No game events, network payloads, registration data, URLs, player information,
guardian records, document contents, authentication material, or SQL parameters
are instrumented. **Do not enable automatic HTTP/SQL/FS instrumentation**
without privacy review. Treat this connection test as infrastructure scaffolding,
not completed tracing of goal events or offline synchronization.

Never make telemetry availability a prerequisite for an official score or
journal write. Before rolling out distributed tracing, define a field allowlist,
sampling/retention policy, service boundaries, local export queue, and acceptance
tests for disconnected operation.

References:
- https://pydantic.dev/docs/logfire/instrument/typescript/packages/node/
- https://pydantic.dev/docs/logfire/instrument/typescript/
