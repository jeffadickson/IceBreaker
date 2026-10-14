# IceBreaker Build, Dependency and Verification Infrastructure Requirements

**Owner:** build/release engineering. **Scope:** developer checkout, CI, dependency resolution, debug and unsigned beta packaging. **Status:** development implementation; production release gates remain open.

| ID | Priority | Requirement | Evidence / state |
|---|---|---|---|
| BLD-001 | P0 | A new developer can diagnose missing prerequisites without starting production services | `tools/icebreaker.py doctor`; implemented |
| BLD-002 | P0 | Use native .NET CLI/MSBuild for C# and central NuGet package versions | `global.json`, `Directory.Packages.props`; implemented |
| BLD-003 | P0 | Pin direct and transitive NuGet dependencies and fail CI on lock drift | `packages.lock.json`, `packages.win-x64.lock.json`, CI locked restore; implemented |
| BLD-004 | P0 | Use Node built-in test runner, npm and a committed npm lockfile; do not add an unnecessary JS build framework | `package.json`, `.nvmrc`, `package-lock.json`; implemented |
| BLD-005 | P0 | Keep Frappe Bench runtime distinct from rink-local Node/.NET and lock standalone Python tests with uv | Frappe `pyproject.toml`/`uv.lock`; implemented for contract tests; Bench integration pending |
| BLD-006 | P1 | Isolate optional scoreboard-camera dependencies from official scoring runtime | Camera `pyproject.toml`/`uv.lock`; implemented |
| BLD-007 | P0 | Offer cross-platform one-command bootstrap, test and build, with no secret defaults or manual dependency copying | `tools/icebreaker.py`; implemented; fresh-machine acceptance pending |
| BLD-008 | P0 | CI verifies Node, Frappe contract tests, xUnit, spectator gateway, Windows desktop publish and camera tests | `.github/workflows/ci.yml`; implemented |
| BLD-009 | P0 | CI must verify dependency manifest and lock coverage | `tools/check_build.py`; implemented |
| BLD-010 | P1 | Provide editor debugger and task configurations for Node and .NET without coupling clock lifetime to UI | `.vscode/launch.json`, `tasks.json`; implemented, operator usability testing pending |
| BLD-011 | P0 | Produce a traceable unsigned Windows beta ZIP and SHA-256 checksum only after verification | `.github/workflows/release-beta.yml`; implemented, manual workflow acceptance pending |
| BLD-012 | P0 | Never treat a beta artifact as a signed production installer | Release docs and workflow labeling; implemented |
| BLD-013 | P1 | Dependency upgrades arrive as reviewed PRs with lockfile updates | `.github/dependabot.yml`, manual lock refresh workflow; implemented |
| BLD-014 | P0 | A reproducible build must not require real minors' data, production credentials or network-accessible league services | Fictional tests and local-only startup; partial security acceptance |
| BLD-015 | P1 | Maintain SBOM, vulnerability checks, code signing and provenance for production releases | **Open** |
| BLD-016 | P0 | Validate clean Windows 11 laptop setup, .NET runtime, authority restart and offline operation | **Open: physical beta acceptance** |
| BLD-017 | P0 | Validate Frappe v16 Bench installation, DocType migrations, two-tenant permissions and rollback | **Open: live Bench integration** |
| BLD-018 | P1 | Evaluate migration from .NET 8 before its end of support, without destabilizing beta | **Open: SDK/runtime upgrade assessment** |

## Verification and update policy

Every manifest change requires the corresponding lockfile(s), `python tools/check_build.py`, all affected tests, and green GitHub Actions on both Linux and Windows. The [build and release guide](../docs/build-and-release.md) is the operational source for commands.

Do not declare BLD-015 through BLD-018 complete on the basis of source-level tests. A dependency lock guarantees repeatable package resolution, **not** byte-for-byte identical builds, code signing, security approval, or verified Frappe deployment.
