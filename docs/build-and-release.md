# IceBreaker — Clone, Build, Test, Debug and Package

This is the canonical developer setup for the **multi-language monorepo**. Do not use a universal Make/CMake wrapper: each component keeps its native toolchain. The small Python 3.12+ stdlib-only `tools/icebreaker.py` script orchestrates those tools on Windows, macOS and Linux.

## 1. Prerequisites

| Component | Tool | Why |
|---|---|---|
| Rink-local service and tests | Node.js 22.13+ (22.16.0 in `.nvmrc`), npm 10 | Built-in Node test runner; OpenTelemetry npm packages |
| Native timekeeper and spectator gateway | .NET 8 SDK (feature baseline in `global.json`) | MSBuild, NuGet, xUnit, Avalonia |
| Orchestration/docs | Python 3.12+ | Standard library only |
| Frappe contract tests | uv (pinned in CI) | Installs managed Python 3.14 and locked test dependencies |
| Optional camera observer | uv | Separate locked OpenCV/numpy environment |
| Central Frappe server | **Frappe v16 Bench** | Python 3.14, Node 24, supported MariaDB/Redis services, and separate Bench-managed frontend dependencies |

**Frappe Bench is not required to run rink-local scoring or its tests.** Its production deployment is a separate milestone. Contract tests exercise source code without claiming a live Bench installation. On a new machine install Git, Node, .NET SDK, Python, and uv from their official sources; do not install an unrelated global npm build tool.

## 2. First checkout

```bash
git clone https://github.com/jeffadickson/IceBreaker.git
cd IceBreaker
python tools/icebreaker.py doctor
python tools/icebreaker.py bootstrap
python tools/icebreaker.py check --configuration Release
```

The bootstrap command uses `npm ci`, NuGet `--locked-mode` and `uv sync --locked`; it fails rather than silently changing dependency versions. It does not download or configure a production Frappe Bench or install an OS-wide database. On Windows, run these commands in PowerShell with Python, Node and dotnet on PATH. The `py -3` launcher can be used instead of `python` where appropriate.

For the optional camera observer:

```bash
python tools/icebreaker.py doctor --profile camera
python tools/icebreaker.py bootstrap --profile camera
python tools/icebreaker.py camera-test
```

## 3. Everyday commands

| Command | Action |
|---|---|
| `python tools/icebreaker.py doctor` | Print tool versions and missing prerequisites |
| `python tools/icebreaker.py bootstrap` | Restore all core dependencies from committed locks |
| `python tools/icebreaker.py test` | Docs, Node/integration/architecture, .NET xUnit, Frappe contract tests |
| `python tools/icebreaker.py build` | Desktop + spectator gateway builds and Frappe syntax checks |
| `python tools/icebreaker.py check --configuration Release` | Full test and build verification |
| `python tools/icebreaker.py frappe-test` | Frappe standalone Python contract tests (not live Bench) |
| `python tools/icebreaker.py camera-test` | Optional camera observer tests |
| `npm start` | Start loopback rink-local backend |
| `npm run start:otel` | Start backend with opt-in OpenTelemetry |
| `python tools/icebreaker.py publish --configuration Release --runtime win-x64` | Publish Windows desktop to `out/desktop` using a RID-specific NuGet lock |

**Do not enter real youth PII in development databases.** Production registration is intentionally gated pending KMS, verified guardianship, secure backups, and other security controls.

## 4. Debugging

**Node authority:** Start `node --inspect-brk apps/rink-local/server/rink-server.js` (or use the committed VS Code Node launch configuration). The authority is an independent process and continues running if the native UI exits.

**Native Avalonia:** Start the rink backend in a separate terminal, then run `dotnet run --project apps/rink-local/src/Icebreaker.Timekeeper.Desktop/Icebreaker.Timekeeper.Desktop.csproj -c Debug`. Use Visual Studio, Rider, or the VS Code C# debugger to attach. Do not let a UI debugger own or reset the official game clock.

**Frappe:** Use `python tools/icebreaker.py frappe-test` for contract tests. For integration/debugging with DocTypes, permissions, and migrations, provision a disposable Frappe v16 Bench and run its native `bench` commands. The monorepo's uv lock is **not** a replacement for the Bench app/environment lock.

## 5. Dependency and toolchain policy

- `.nvmrc` and `package.json` select Node 22/npm 10 for the rink service. `package-lock.json` pins the npm dependency graph. CI runs `npm ci` (never `npm install`).
- `global.json` selects .NET 8 SDK feature baseline. `Directory.Packages.props` centrally pins direct NuGet versions. `packages.lock.json` files pin transitive graphs; Windows publish uses `packages.win-x64.lock.json`. CI restores with `--locked-mode`.
- `apps/frappe/icebreaker_league/pyproject.toml` describes Frappe v16's Python 3.14 package. Its `uv.lock` pins standalone contract-test dependencies, including optional telemetry extras. The actual Frappe/Bench deployment has its own dependency lifecycle.
- `tools/scoreboard-camera/pyproject.toml` and `uv.lock` isolate optional OpenCV/numpy from the rink runtime.
- `NuGet.Config` explicitly declares nuget.org. No secrets or private package feed credentials are committed.

**Updating dependencies:** change the direct version constraint in its native manifest, regenerate locks with the native tool, run all tests and review the lock diff. A dedicated manual [Generate dependency locks workflow](../.github/workflows/generate-locks.yml) is provided for GitHub-hosted regeneration; it commits regenerated lockfiles on `main` when explicitly updated/triggered. Do not manually fabricate lockfiles.

Local equivalents:

```bash
npm install --package-lock-only --ignore-scripts
uv lock --project apps/frappe/icebreaker_league
uv lock --project tools/scoreboard-camera
dotnet restore apps/rink-local/tests/Icebreaker.Core.Tests/Icebreaker.Core.Tests.csproj --use-lock-file
dotnet restore apps/rink-local/src/Icebreaker.SpectatorGateway/Icebreaker.SpectatorGateway.csproj --use-lock-file
dotnet restore apps/rink-local/src/Icebreaker.Timekeeper.Desktop/Icebreaker.Timekeeper.Desktop.csproj --use-lock-file -r win-x64 -p:NuGetLockFilePath=packages.win-x64.lock.json
```

After updating a package, commit all affected lockfiles together. A CI locked restore must pass on Linux and Windows.

## 6. CI and release

`.github/workflows/ci.yml` tests Node and documentation, Frappe Python contracts, .NET/xUnit and spectator gateway, optional camera, and a Windows x64 desktop publish. The Windows artifact is **unsigned**, framework-dependent, and requires the .NET 8 Desktop Runtime. It is a beta/test artifact, **not** a production installer.

Before a release: require green CI on the release commit, test a fresh Windows machine, test both laptops and authority restart, verify signing/certification behavior, and conduct security acceptance. Record the exact Git SHA and dependency lock revisions. Production secrets and private player databases must never be packaged.

## 7. Known remaining work

A live Frappe Bench install and two-tenant authorization test, Windows code-signing and installer, deployment-level secret management, software bill of materials and vulnerability monitoring, and reproducible OS/container image pinning remain release tasks. Compiler/package locks make dependency resolution repeatable but **do not guarantee byte-for-byte identical binaries across machines**.
