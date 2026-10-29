# IceBreaker development continuation prompt

You are continuing engineering development of **IceBreaker**, a hockey-first scoring, rink operations and league administration platform.

Repository: https://github.com/jeffadickson/IceBreaker

## Current continuation baseline — 2026-10-28

Fresh validation passed 256 Node tests on Node 22.16.0 and 41 .NET tests using installed SDK 10.0.403 while targeting net8.0. See `docs/development/continuation-verification-2026-10-28.md` for commands, scope and limitations. StrictDoc 0.30.4 is now available locally: both continuation requirement documents parsed and exported successfully after correcting invalid legacy-style requirement terminators. These results supersede the earlier statement that StrictDoc was unavailable for these two documents; the rest of the legacy requirement files have not been validated.

The existing CI workflow had literal backslash-n tokens in an artifact-upload step. These were repaired and the YAML parsed; its trigger policy remains unchanged. Always derive paths from the current checkout and user environment, check directories with `Test-Path -LiteralPath ... -PathType Container` before using them, and reuse installed tools before installing anything. Prefer maintained property/fuzz tools and Stryker.NET for future .NET mutation campaigns; the earlier small custom checks are historical evidence, not a substitute for such campaigns.

Treat this file as a development handoff. Inspect current source, Git status and verification evidence before making changes; the state below is a dated snapshot, not a claim that future HEAD has been tested.

## Mission

Develop small, coherent, independently verifiable increments toward a dependable rink-local scoring authority and secure league services. Preserve offline scoring, immutable journal history, accurate spectator results and youth privacy. Complete implementation, requirements traceability, tests and documentation together. Do not describe prototypes, source-contract tests or mocked integrations as production acceptance.

## Read first

1. Any applicable `AGENTS.md` and the human user's current instructions.
2. `README.md`, `REPO_ROADMAP.md`, `DEPLOYMENT_STATUS.md`, `COMPLETENESS_AUDIT.md` and `TEST_RESULTS.md`; reconcile old status claims with source and current test results.
3. `requirements/README.md`, `requirements/traceability.md`, the relevant requirement documents and existing StrictDoc files under `apps/rink-local/requirements/`.
4. `docs/development/code-documentation-standard.md` and `docs/build-and-release.md`.
5. `docs/architecture/adr-001-frappe-league-administration.md`, `adr-002-host-identity-and-offline-authorization.md`, and `adr-003-standalone-identity-and-parent-onboarding.md`.
6. The verification reports under `docs/development/`, especially the 2026-10-24 identity and Windows baseline reports.

## Architecture and authority boundaries

- `apps/rink-local/server/`: Node/SQLite authority, league services, identity policy, registration, certification and local HTTP endpoints. Existing authority is not a completed unified C# production backend.
- `apps/rink-local/src/Icebreaker.Core/`: experimental C# core, persistence, auditing and authority client contracts.
- `apps/rink-local/src/Icebreaker.Timekeeper.Desktop/`: Avalonia native Windows operator console, PA queue and speech integration. The desktop obtains snapshots from the separate authority process.
- `apps/rink-local/web/`: operator, spectator, league, registration and other development web interfaces.
- `apps/rink-local/tests/browser/`: Node unit/integration tests and some source contracts. The folder name does not mean all tests execute an actual browser.
- `apps/rink-local/tests/Icebreaker.Core.Tests/`: .NET unit and desktop-support tests.
- `apps/frappe/icebreaker_league/`: central league administration migration scaffold and signed policy/schedule pilots. Live Bench validation and production cutover remain separate gates.
- `services/ingest/`: station synchronization and recovery experiments.
- `src/team-workflows/`: versioned manager checklist proof of concept.
- `requirements/`, `contracts/`, `docs/`, `ops/`, `config/` and `tools/`: requirements, protocol/schema contracts, operator/developer documentation, deployment templates and tooling.

Do not rearrange these directories casually: tests and source imports depend on existing relative paths. Keep optional Frappe, telemetry and speech provider availability independent of rink-local authority.

## Invariants to preserve

1. The rink journal is authoritative. Accepted events are immutable; corrections are new, attributed events. Never silently rewrite official history.
2. The native UI does not invent official clock state when disconnected. Reconnection uses authority snapshots. Closing the UI must not terminate the independent authority.
3. Parent/spectator results retain the actual full score and approved goals even when an arena mercy display caps the visible score.
4. Game timing rules remain pinned and versioned. Reject conflicting rules on reopen and release database resources on failed initialization.
5. Authorization is deny-by-default, enforced for the correct user and resource scope. `identity-policy.js` consumes trusted server-loaded identity/grants; it does not authenticate tokens. Superuser access requires trusted bootstrap provenance and verified MFA.
6. Evaluation time must be a finite number. Grants expire at the exact expiry instant, not one millisecond later. Parent grants allow only own-account actions and confer no custody or league administration rights.
7. Signed Frappe training staging remains a separate policy-only cache. Never silently modify official games, rosters, completion records or eligibility from staged data. Reject authoritative/private databases and symlinks.
8. Malware scanning fails closed on invalid inputs, transport errors, malformed replies and infection. Unix sockets or local Windows named pipes provide IPC; do not enable remote network scanning as a test shortcut. A clean verdict alone does not approve a document.
9. Use fictional records only in development. Preserve private-field encryption, quarantine, consent, access control and production-mode refusal gates.
10. Native roster suggestions come from authenticated confirmed/eligible lineups. Suggestions do not replace server command validation.

## Engineering requirements

- Prefer C# or F# for new scripts and automation; use PowerShell/native cmdlets for shell and file operations. Existing Node modules and tests should be maintained in their native language.
- Maintain stable requirement IDs in StrictDoc with implementation and verification evidence. Extend existing IDs where semantics match; do not create duplicate or conflicting requirements. Do not mark a requirement production-verified from a unit test alone.
- Document public interfaces, trust boundaries, assumptions, numerical/time conventions, disposal ownership and non-obvious logic. Keep comments accurate; avoid comments that restate assignments.
- Collect line and branch coverage for code changes. Identify excluded files, unexecuted branches and collector limitations. Coverage is evidence about execution, not a proof of correctness.
- Include relevant malformed-input/negative tests, reproducible randomized/property checks and targeted mutation tests. Preserve seeds and minimized counterexamples when failures occur. Report exactly what ran, rather than claiming a broad fuzz or mutation campaign from a few cases.
- Use Pester for PowerShell tests, FsCheck for suitable .NET properties, cargo-nextest for Rust, Arrow .NET for suitable columnar results and DuckDB for Parquet querying when those technologies are applicable.
- Preserve unrelated local work; inspect `git status`, `git diff` and current commits before edits. Do not reset or discard another task's changes.
- Do not weaken assertions, swallow exceptions, skip security checks or change production policy merely to obtain green tests. Separate real platform limitations from code defects.
- Do not commit secrets, real youth information, local databases, scan payloads, temporary mutation trees or generated coverage output. `out/verification/` is ignored and holds local evidence.

## Baseline and local changes on 2026-10-24

The repository was cloned into this task's initially empty workspace from base commit `9270915`.

The initial identity suite could not parse because of a literal backslash-n embedded between assertions. The repaired tests now cover a finite evaluation clock, exact expiry boundaries, own-account isolation and superuser bootstrap/MFA provenance. Temporal randomized checks use seed `0x1cebeef`; the existing ID-012 is formalized in `requirements/identity-policy.sdoc`.

The initial full Node run on Windows/Node 24 had six failures. Corrections made during this continuation:

- Authority construction closes SQLite on initialization failure, fixing the Windows file lock after a rejected timing-policy change.
- ClamAV uses bounded local IPC appropriate to the OS. Windows tests run the real INSTREAM transport over local named pipes rather than invalid Unix socket paths.
- Windows training-cache tests exercise symlink rejection with a controlled `lstatSync` result because ordinary Windows file symlink creation requires extra privilege. Non-Windows tests still create a real symlink; the mock does not establish real Windows symlink integration acceptance.
- Desktop startup calls authenticated roster suggestion loading for both teams. Literal backslash-n tokens accidentally embedded in C# declarations and statements were converted to real newlines.
- The .NET audit test disposes its writer before `File.ReadAllLines`, respecting Windows sharing semantics.
- The long-lived desktop announcement queue disables SQLite pooling so disposal releases its database file for restart and maintenance.

Check the working tree before assuming these changes are committed or pushed. Consult `docs/development/windows-baseline-verification-2026-10-24.md` for final results and remaining limitations.

## Reproduce validation

Use the root `.nvmrc` Node version (22.16.0) and npm version constraints in `package.json`. A globally installed Node 24 is outside the repository's declared runtime range.

```powershell
$repo = (Get-Location).Path
if (-not (Test-Path -LiteralPath $repo -PathType Container)) { throw 'Repository missing' }
node --version
npm test
node --test --experimental-test-coverage apps/rink-local/tests/browser/*.test.js
dotnet --info
dotnet build apps/rink-local/src/Icebreaker.Timekeeper.Desktop/Icebreaker.Timekeeper.Desktop.csproj --configuration Release
dotnet test apps/rink-local/tests/Icebreaker.Core.Tests/Icebreaker.Core.Tests.csproj --configuration Release --collect 'Code Coverage;Format=cobertura'
git diff --check
git status --short
```

If Node 22 is not selected globally, the following invokes the pinned executable without editing project manifests:

```powershell
$repo = (Get-Location).Path
if (-not (Test-Path -LiteralPath $repo -PathType Container)) { throw 'Repository missing' }
npm exec --yes --package=node@22.16.0 -- node --test --experimental-test-coverage apps/rink-local/tests/browser/*.test.js
```

`global.json` requests SDK 8.0.400 with `latestFeature` roll-forward. On this host only SDKs 8.0.132 and 10.0.402 were present initially, so normal root .NET SDK resolution fails. Install a compatible SDK for the canonical build. A supplemental build can run the absolute project path from a directory outside this checkout using installed SDK 10, while still targeting net8.0; label that evidence accurately and do not edit `global.json` just to hide the mismatch.

Follow `docs/build-and-release.md` for the repository's Python-based existing tooling, locked restores, docs checks, optional Frappe tests and release packaging. Using existing Python-required tools is compatible with the preference for C#/F# for new automation. Validate StrictDoc with the supported tool when available; do not claim validation merely because a file was written.

## Recommended next work

1. Establish pinned Node/npm and .NET SDK tooling, rerun the documented baseline and preserve exact commands/results.
2. Validate StrictDoc and reconcile the new traceability with existing Markdown requirements without renumbering stable IDs.
3. Add real Avalonia interaction tests for initial/reconnected rosters, eligibility changes, modal drafts, failed submissions and disconnected operation. Source regex tests and compilation do not prove UI behavior.
4. Review desktop roster freshness after initial startup; refresh policy must preserve drafts and avoid treating old choices as authorization.
5. Continue identity endpoint integration: trusted principal construction, durable role grants/revocation, session isolation, OIDC negative cases and cross-tenant checks. Keep production onboarding gated.
6. Work through the distributed recovery, Frappe Bench and physical rink acceptance items in `REPO_ROADMAP.md` in separately verifiable increments. Do not claim hardware or multi-station certification from synthetic runs.

## Required handoff after each increment

State what changed and why, link requirements and implementation, list executed tests and coverage, give mutation/fuzz/property seeds and results, identify remaining failures or unmeasured areas, and distinguish local changes from commits/pushes. Update this prompt when architecture or the continuation baseline materially changes.
