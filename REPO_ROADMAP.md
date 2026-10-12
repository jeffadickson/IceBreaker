# Proposed next architectural refactor (not yet completed)

The current prototype is intentionally kept intact under `apps/rink-local/` so that its relative source/test paths work. Refactor **in tested PRs** toward:

```text
apps/
  rink-console/       Avalonia touch scorekeeper / local operator UX
  league-web/         Parent tracker, leagues, teams, standings, schedules
  league-api/         Authenticated central API
  arena-gateway/      Scoreboard/PA/horn hardware
services/
  ingest/             Remote station synchronization, leases, auth
  certification/      Elsa workflows, officials, immutable signatures
  notifications/      Parent opt-in email, templates, dedup delivery
src/
  IceBreaker.Core/    Sport-neutral platform and event contracts
  IceBreaker.Hockey/  Hockey clock/penalty/scoring rules
  IceBreaker.Persistence/
  IceBreaker.Contracts/
tests/
  unit/ integration/ e2e/ recovery/ security/
docs/site/            Published HTML operator/parent/developer manuals
requirements/         StrictDoc and traceability
```

**Do not move current backend files without rerunning existing tests**; current code imports paths relative to `apps/rink-local`.
