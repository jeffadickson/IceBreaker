# Windows development baseline — 2026-10-24

Base commit: `9270915`, with local continuation changes. Requirements: [Windows baseline StrictDoc](../../requirements/windows-development-baseline.sdoc); the earlier identity change remains traced by [ID-012](../../requirements/identity-policy.sdoc). See [root continuation prompt](../../prompt.md) for architecture and next work.

## Repairs

- WIN-RES-001: close Node SQLite after any authority initialization failure; the timing policy rejection had leaked a handle and prevented Windows temporary-directory cleanup.
- WIN-IPC-001: support local Windows named pipes alongside Unix socket IPC; run real INSTREAM fixtures on the host's supported local transport. No TCP/remote endpoint bypass was introduced. Added malformed-byte, oversized/unexpected-response and seeded remote-endpoint tests.
- Training-cache symlink rejection: unprivileged Windows uses a controlled `lstatSync` result to exercise denial without requiring symlink creation rights. Other platforms retain a real file symlink test. This is not real Windows symlink acceptance evidence.
- WIN-UI-001: invoke both authenticated roster loaders after the initial desktop snapshot; repair literal backslash-n tokens in declarations and statements that blocked C# compilation.
- WIN-RES-002: disable connection pooling for the owned desktop PA queue so disposal releases its database file. Correct an audit-log test to close the writer before using the default Windows read-sharing mode.

## Executed verification

Pinned runtime invocation:

```powershell
npm exec --yes --package=node@22.16.0 -- node --test --experimental-test-coverage apps/rink-local/tests/browser/*.test.js
```

Result: **256 passed, 0 failed, 0 skipped**. Node instrumented-source coverage: **94.72% lines, 83.93% branches, 96.13% functions**. These are loaded-file metrics, not an inventory of all repository source.

| Changed Node module | Line coverage | Branch coverage |
|---|---:|---:|
| authority-sqlite.js | 99.24% | 93.43% |
| malware-scanner.js | 100% | 88.46% |
| identity-policy.js | 100% | 86.21% |

The desktop Release build succeeded with **0 warnings and 0 errors**. .NET tests: **41 passed, 0 failed, 0 skipped**, with the Microsoft Code Coverage collector emitting Cobertura. Aggregate collector coverage: **1,440/2,289 lines (62.91%)**, **390/825 branches (47.27%)**. AnnouncementQueue class: **98.95% lines, 71.79% branches**. TimekeeperWindow has **0% runtime coverage**: compilation and Node source contracts do not execute Avalonia interaction paths.

The repository-pinned .NET SDK 8.0.400 is absent locally (8.0.132 and 10.0.402 installed). The successful build and tests used SDK **10.0.402** from a working directory outside repository `global.json`, passing an absolute project path, still targeting net8.0. The canonical pinned-SDK build remains to be repeated; no global.json changes were made to hide the mismatch.

Commands for the supplemental .NET run, executed outside the checkout:

```powershell
dotnet build <absolute-repo>/apps/rink-local/src/Icebreaker.Timekeeper.Desktop/Icebreaker.Timekeeper.Desktop.csproj --configuration Release
dotnet test <absolute-repo>/apps/rink-local/tests/Icebreaker.Core.Tests/Icebreaker.Core.Tests.csproj --configuration Release --collect 'Code Coverage;Format=cobertura' --results-directory <absolute-repo>/out/verification/dotnet-final
```

## Adversarial checks and limitations

Endpoint negative/property checks ran 100 deterministic LCG iterations with seed `0x1ce`, each rejecting a TCP-style endpoint, remote named pipe and oversized path. The earlier temporal property check ran 1,000 iterations with seed `0x1cebeef`. No counterexamples occurred, so none required minimization. This is bounded input testing, not broad interface fuzzing.

Two isolated scanner mutations were killed: infection classified as clean; invalid byte input returned as clean. The earlier identity run killed two clock/expiry mutations. These four targeted mutations are not an exhaustive repository mutation score. No desktop/authority mutation campaign ran.

Local raw Node logs and coverage are in ignored `out/verification/`; .NET Cobertura is under `out/verification/dotnet-final/`. StrictDoc CLI validation was not performed because the tool is unavailable. Actual ClamAV deployment/signature updates, real Windows symlink behavior, live Avalonia roster usability/reconnect behavior, physical rink hardware and production security acceptance remain unverified. Unix IPC must still be executed on Unix CI.
