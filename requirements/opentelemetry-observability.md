# IceBreaker Observability: OpenTelemetry + optional Logfire

Status: **development increment 1**. Instrumentation is opt-in and off by default. The rink must remain fully operational if the Collector, network, or Logfire is unavailable.

## Why OpenTelemetry rather than a Logfire-only SDK?

Pydantic Logfire is an OpenTelemetry-native observability platform. It can receive traces and metrics from Node.js, Python and .NET. IceBreaker should own its telemetry instrumentation and export OTLP to a **local OpenTelemetry Collector**. The Collector can forward approved telemetry to Logfire, Jaeger, Grafana, or another backend without changing the scoring engine. Logfire is an optional analysis UI, not an operational dependency.

## Trust boundary

```text
Native Windows UI -- W3C traceparent --> Rink-local Node authority
  ActivitySource                         OTel spans and metrics
       |                                        |
       +-----------(local only)----------------+
                                                |
                                   127.0.0.1:4318 OTLP Collector
                                                |
                                    privacy filtering, batching
                                                |
                                      optional remote Logfire
```

**No telemetry export from the rink unless explicitly enabled.** The Node exporter rejects non-local OTLP endpoints. Configure any remote destination, credentials, TLS and filtering in the Collector, not on a rink laptop. Never let a telemetry outage block a clock command, scoring event or database commit.

## Requirements

- OTEL-001 P0: Emit OTel spans for inbound HTTP operations, authoritative game commands, and desktop command/snapshot operations.
- OTEL-002 P0: Emit counters for HTTP requests, command accepted/duplicate/rejected, and unhandled errors, plus request-duration histogram.
- OTEL-003 P0: Propagate W3C trace context between the native .NET client and the local Node authority without exposing credentials.
- OTEL-004 P0: Use **bounded allowlisted attributes** only. Route families, HTTP method, status group, and recognized event type are permitted. No full URL/path/query, headers, payloads, names, birth dates, addresses, guardian contacts, certificates, emails, document IDs, passwords, or secrets.
- OTEL-005 P0: No auto-instrumentation of HTTP, SQLite, browser or private registration fields until independently reviewed for data leakage.
- OTEL-006 P0: Telemetry is disabled by default and cannot become a dependency for local scoring or offline operation.
- OTEL-007 P0: Only local Collector endpoints are accepted from the rink; remote export must occur behind the Collector with TLS and controlled credentials.
- OTEL-008 P1: Add end-to-end tracing for backend sync, scoreboard projection, certification, training intake and backup takeover, using opaque correlation identifiers.
- OTEL-009 P1: Add alerting for command rejection, event-sync backlog, collector outage, stale scoreboard, DB latency and referee-signing errors, with no private data in alerts.
- OTEL-010 P1: Define sampling, retention, access control, privacy review, incident-response use, and trace/metric cardinality limits.
- OTEL-011 P0: An OpenTelemetry span is **diagnostic data, not an authoritative audit record**. Game events and scoresheet signatures remain in the existing immutable journal.

## Implemented

- `apps/rink-local/server/telemetry.js`: explicitly allowlisted request and game-command spans, counters and request duration metrics.
- `apps/rink-local/server/otel-bootstrap.js`: optional Node SDK, OTLP HTTP exporters, local endpoint checks, disabled auto-instrumentation.
- `apps/rink-local/server/rink-server.js`: HTTP request boundaries and committed/rejected game commands instrumented.
- `Icebreaker.Core/Integration/RinkClockClient.cs`: .NET ActivitySource for snapshots and commands and W3C traceparent propagation. The native desktop now configures an opt-in OpenTelemetry .NET SDK OTLP HTTP exporter to the local Collector.
- `apps/rink-local/tests/browser/otel-observability.test.js`: route/event privacy tests, no-op behavior and HTTP regression.

## Start Node with telemetry

Install optional dependencies from the repo root using `npm install`, then start a local Collector using the sample `ops/otel/collector.local.yaml`.

```bash
ICEBREAKER_OTEL_ENABLED=1 npm run start:otel
```

Default endpoints are `http://127.0.0.1:4318/v1/traces` and `http://127.0.0.1:4318/v1/metrics`. Override only with localhost endpoints via `ICEBREAKER_OTEL_TRACES_URL` and `ICEBREAKER_OTEL_METRICS_URL`.

Use a development Collector debug exporter first. To use Logfire, configure the Collector's remote OTLP exporter with Logfire's **current** project-specific endpoint and secret token, TLS and filtering. Do not put the token in source control or browser JavaScript. See https://pydantic.dev/docs/logfire/get-started/first-trace/ and https://opentelemetry.io/docs/collector/.

The native Windows desktop uses the same `ICEBREAKER_OTEL_ENABLED=1` opt-in flag and defaults to `http://127.0.0.1:4318` for its OTLP/HTTP exporter; `ICEBREAKER_OTEL_DOTNET_ENDPOINT` may override this only to a local Collector. The .NET client emits allowlisted ActivitySource spans for snapshot and command operations, with W3C traceparent propagation. These spans are not yet end-to-end tested against a running Collector.

## Remaining work

The first implementation instruments the Node rink backend and emits .NET ActivitySource hooks. We still need production Collector deployment, bounded buffering and sampling, sync/backup trace propagation, explicit child spans for SQLite transactions, full integration tests with an actual OTLP receiver, and security review of Collector configuration.

The existing STRIDE risk register remains applicable; adding telemetry does not resolve shared operator identity, KMS, consent, or other production security gates.
