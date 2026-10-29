# Continuation verification — 2026-10-28

Base: `9270915`; verification covers the local identity, Windows resource/IPC and desktop fixes described in the 2026-10-24 reports. This report records new execution, rather than treating those historical results as fresh evidence.

## Executed baseline

- Windows, Node **22.16.0**, selected through `npm exec --yes --package=node@22.16.0 -- node --test --experimental-test-coverage apps/rink-local/tests/browser/*.test.js`: **256 passed, 0 failed, 0 skipped**. Instrumented loaded-file coverage: **94.72% lines, 83.93% branches, 96.13% functions**. This is not repository-wide source inventory coverage.
- .NET SDK **10.0.403**, invoked outside the checkout with the absolute project path, Release configuration and `--collect 'Code Coverage;Format=cobertura'`: **41 passed, 0 failed, 0 skipped** targeting net8.0. Coverage: **1,440/2,289 lines (62.91%)**, **390/825 branches (47.27%)**. The desktop compiled successfully. TimekeeperWindow still has zero runtime coverage; no physical UI acceptance is claimed. SDK 8.0.400 validation is a separate continuation step.
- `python -X utf8 tools/check_docs.py`: **23 HTML pages, 0 errors**. The UTF-8 flag is necessary on this Windows host; the unqualified command initially failed decoding UTF-8 content as CP1252.
- `python tools/check_build.py`: **4 .NET projects, npm lock, 2 uv locks, 0 errors**.
- PyYAML **6.0.3** parsed `.github/workflows/ci.yml` and confirmed the rink-local Node test step. Repaired literal backslash-n tokens in an existing artifact-upload step; CI triggers and job policy remain unchanged.
- `git diff --check`: passed.

## Real StrictDoc verification

Installed StrictDoc **0.30.4** rejected the new files' `[/REQUIREMENT]` terminators and excess blank separators. Those files had followed the repository's legacy examples; the invalid syntax has now been corrected using the installed tool's grammar.

The following real export succeeded, including traceability graph construction and HTML generation:

```powershell
$repo = (Get-Location).Path
if (-not (Test-Path -LiteralPath $repo -PathType Container)) { throw 'Repository missing' }
$strictdoc = Join-Path $env:APPDATA 'Python/Python313/Scripts/strictdoc.exe'
if (-not (Test-Path -LiteralPath $strictdoc -PathType Leaf)) { throw 'Resolve an installed StrictDoc executable first' }
& $strictdoc export requirements/identity-policy.sdoc requirements/windows-development-baseline.sdoc --no-parallelization --output-dir out/verification/strictdoc-continuation
if ($LASTEXITCODE -ne 0) { throw 'StrictDoc export failed' }
```

Scope is **two documents, five stable requirement IDs**, not every legacy `.sdoc` in the repository. No production acceptance or closure status was advanced. Default multiprocessing did not finish promptly on this host; the recorded successful command disables parallelization. Generated output is ignored under `out/verification/`.

The earlier targeted mutation and seeded negative/property results remain historical evidence in the 2026-10-24 reports; no new mutation run is claimed for this revalidation. Exact tested file hashes accompany this report in `continuation-source-hashes-2026-10-28.json`. Stryker.NET and live Avalonia interaction coverage remain follow-up work.
