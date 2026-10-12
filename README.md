# IceBreaker

**Hockey-first, sport-extensible scoring, rink operations, and league management.**

> **Status: development prototype.** The Node.js local server and C# components are not yet one unified production authority. No public-internet deployment or game certification is supported. Sample teams/results are fictional.

## Launch

- **Browse the complete HTML manual:** open [`docs/site/index.html`](docs/site/index.html).
- **Windows:** double-click `START_ICEBREAKER_WINDOWS.cmd`.
- **Run the local rink, parent live, and league demo:** install Node.js >=22.13; run `node apps/rink-local/server/rink-server.js` from the repository root; visit `http://127.0.0.1:8090/operator.html`, `/live.html`, and `/league.html`.
- **Run Node test suite:** `node --test apps/rink-local/tests/browser/*.test.js`.
- **Run .NET tests when .NET SDK 8+ is installed:** `dotnet test apps/rink-local/tests/Icebreaker.Core.Tests/Icebreaker.Core.Tests.csproj`.

See [DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md) for source inventory, incomplete features, and safe push procedure.

## Repository map

| Folder | Contents | Status |
|---|---|---|
| `apps/rink-local/` | Existing Node/SQLite prototype, browser UI, experimental C# libraries/gateway, tests | Implemented prototype |
| `docs/site/` | Offline HTML manuals, architecture, workflows, safety, deployment, testing | Included |
| `requirements/` | StrictDoc requirement files and proposed workflow policies | Mixed accepted/proposed; see individual files |
| `config/` | Example deployment and workflow configurations | Templates only |
| `contracts/` | OpenAPI starter contract and reference SQLite schema | Included, not complete coverage |
| `research/source-audit/` | Repository feature comparison and proposed v4 requirements | Included |
| `docs/specifications/` | Archived product/system/verification/implementation DOCX plans | Included |
| `tools/` | Local integrity and link check utilities | Included |
| `.github/workflows/` | CI for Node tests and docs links; separate .NET tests | Configured; run results depend on GitHub |

## Engineering principles

1. SQLite authoritative rink journal; no silent overwrites or clock extrapolation.
2. All accepted game events are immutable; corrections are new events. Operator actions have a private, low-level audit trail.
3. Parent live tracking shows **full actual score and all approved goals**, even under mercy rules. Arena display may be capped.
4. Local/offline support takes precedence over optional speech providers and cloud availability.
5. Certification must prove assigned-game authority, complete event sequence, scoresheet revision, and an authorized referee approval.
6. Youth privacy, access control, and opt-in notifications are release blockers.

## Maturity

**Running prototype:** local rink scorekeeper, parent tracker, league demo, persistent Node SQLite server and tests. **Partial/proposal:** C# engine, certified results, workflow policies, online spectator gateway. **Not yet implemented:** remote station authentication and sync, Elsa runtime, electronic sign-off, parent accounts/email, production deployment.

## License and assets

Original project code is intended for Apache-2.0 licensing **subject to ownership/licensing review before publication**; artwork, team identities, and product trademarks are not granted under that intent. The bundled prototype includes previously generated code; review ownership, dependencies, and `LICENSE` before publishing. Third-party audit reference repositories are **not included**.

## Release gates

See [verification manual](docs/site/testing.html) and [security manual](docs/site/security.html). Do not expose the development operator key or HTTP server publicly.

## Parent accounts (development preview)

Open `http://127.0.0.1:8090/parent.html` after `npm start`. Supports password registration, verification tokens queued in SQLite, server-side sessions, Google OIDC code+PKCE (when configured), saved favorites, and report preferences. **Outbound verification mail, end-of-game reports, account recovery, and production deployment are not complete.** See `docs/site/parent-auth.html` and `requirements/parent-accounts/requirements.md`.

## v1.3: shots, penalties, unofficial reports

The local server exposes `/api/games/demo/unofficial-report`, `/api/games/demo/unofficial-report.json`, and `/api/league/v1/penalty-frequency`. Penalty rankings are **local journal statistics**, not yet a centralized certified-league ranking. See `requirements/scorekeeping-v1.3.md`.

## Team Manager portal (v1.4 development preview)

Open `/team.html` from the running rink server. The backend provides separate team login, team-scoped season roster updates and signed-in game-day lineup confirmations. A development league operator can provision a team account through `POST /api/team/v1/admin/accounts`. See `requirements/team-accounts-v1.4.md`. This is not production-ready identity management.
