# IceBreaker Development Instructions

These instructions apply to all development in this repository, including contributions by coding agents.

## Source of truth
- Inspect existing files and requirements before implementing changes; do not replace real code with illustrative scaffolding.
- The versioned repository is the source of truth. Use stable requirement IDs under `requirements/` and maintain `requirements/traceability.md` for behavioral changes.
- Make status clear: implemented, tested, experimental, or planned. Do not claim tests or deployment succeeded without evidence.

## Branches and pull requests
1. Start from updated `main`; create a short-lived branch named `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, or `chore/<topic>`.
2. Keep each PR limited to one coherent change. Do not commit directly to `main`, except an explicitly authorized emergency fix.
3. Include requirement IDs, implementation summary, verification evidence, risks, privacy/security impact, and documentation changes in the PR.
4. Prefer an ordinary reviewed PR with passing CI. Do not force-push protected branches or merge failing checks.
5. Never merge automatically unless explicitly requested by the repository owner. Report the PR URL and test status.

## Required checks
- `npm test` (Node.js backend/browser models)
- `python tools/check_docs.py` (HTML manual links)
- `dotnet test apps/rink-local/tests/Icebreaker.Core.Tests/Icebreaker.Core.Tests.csproj -c Release` when the .NET 8 SDK is available
- CI must run Node, documentation, and .NET tests for every PR. Note any environmental limitations rather than claiming tests ran.

## Architecture and invariants
- Authoritative game actions are appended to the SQLite event journal; rejected, draft, and canceled operator interactions belong in a separate private audit trail.
- All meaningful game actions require low-level operator logging; official corrections are additive events, never destructive edits.
- Commands must be idempotent and replay-safe. Preserve crash recovery and clock-authority rules.
- Spectator Live shows the full official score and approved play-by-play. Arena mercy-rule display caps must not change that score.
- TBD is distinct from None for scorers and assists; no attribution correction may count as an additional goal.
- Unofficial end-of-game reports must be labeled as such until authorized certification.
- League standings and certified player statistics must exclude uncertified results.
- Team/game roster edits, review, approval, and user permissions require authentication and immutable attribution.
- Parent, player, and guardian data are privacy-sensitive; never commit identifiable youth fixture data or credentials.

## Security and deployment
- No secrets, OAuth client secrets, tokens, .env files, production databases, or personal data in Git.
- Treat all remote scoring, signing, and public accounts as untrusted inputs. Enforce authorization server-side.
- Changes to persistent schemas, APIs, league workflows, or identity must document compatibility and migrations.
- Prefer configuration and tests over undocumented operational decisions.

## Repo locations
- `apps/rink-local/server/`: Node.js + SQLite development backend
- `apps/rink-local/web/`: scorekeeper, parent tracker, league and account pages
- `apps/rink-local/src/`: C# domain engine and gateway prototype
- `apps/rink-local/tests/`: C# and Node.js automated tests
- `requirements/`: proposed and approved traceable requirements
- `docs/site/`: HTML user manuals
- `.github/workflows/`: CI

When uncertain, document assumptions in the PR instead of silently changing existing behavior.
