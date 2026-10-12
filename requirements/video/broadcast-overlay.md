# IceBreaker live video overlay — requirements (proposed v1.9)

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| VIDEO-001 | P0 | The system shall provide a transparent-background, 16:9-friendly browser source for OBS, vMix or equivalent live-stream compositors. | Transparent HTML/CSS and browser-source HTTP route test. |
| VIDEO-002 | P0 | The overlay shall show teams, game clock, period, score, and shots on goal for both teams. | Snapshot rendering and shot regression test. |
| VIDEO-003 | P0 | The full-score overlay shall show the actual official score independently of mercy display caps. | Full vs arena endpoint policy regression test. |
| VIDEO-004 | P0 | The overlay shall expose no scoring commands, operator credential, personal audit logs or privileged roster data. | Static client and server authorization test. |
| VIDEO-005 | P0 | The overlay shall detect loss of its update feed and visibly indicate stale data rather than implying live operation. | Staleness policy test. |
| VIDEO-006 | P1 | The overlay shall offer compact and standard layouts selectable by URL query. | Browser/source inspection. |
| VIDEO-007 | P1 | The local rink overlay shall be available without network connectivity to the league server. | Offline rink integration test. |
| VIDEO-008 | P1 | The production hosted overlay shall use TLS, tenant/game scoped authorization, and restricted embed tokens. | Production security test (not yet implemented). |
| PERF-001 | P0 | Central platform capacity shall be defined by active games, ingest events/second, concurrent SSE/WebSocket clients, and database write latency, not total registered teams alone. | Load-test report at representative peak traffic. |
| PERF-002 | P0 | The hosted system shall pass a 3,000-active-team representative scenario before claiming capacity, including reconnect bursts, live spectators, and realistic writes. | Reproducible load tests, p95/p99 latencies and resource utilization. |

## Intentional boundaries

The initial browser overlay is a local rink development interface using read-only snapshot/SSE endpoints. It does not record or transmit video and is not a streaming service. Team names and statistics are supplied by the local game engine. Browser source can be added to OBS at 1920×1080 with transparent background. Public remote multi-tenant overlay and capacity certification remain future work.