# Pinned tooling and CI follow-up — 2026-10-28

Base: `191ac58`. Tested source hashes are in `pinned-baseline-source-hashes-2026-10-28.json`. This increment preserves existing CI triggers and dependency pins.

## Findings and repairs

The initial push's [CI run](https://github.com/jeffadickson/IceBreaker/actions/runs/40810113114) passed .NET, Windows desktop packaging and camera tests, but failed the Node job before its tests: `tools/audit_code_docs.py` contained three literal backslash-n tokens outside Python strings. These tokens are now newlines. Added DOC-AUDIT-001 report-consistency and negative CLI tests exercise the real command rather than a substitute implementation. This is an existing required Python tool, not a new Python automation dependency.

The broader local integration run exposed teardown ownership errors: a fixture removed its directory before the additional restarted server and rink database were closed. On Windows this produced EBUSY and left the process running. A 15-second diagnostic run reproduced the failure. The fixture now owns a reverse-order dependent cleanup list; the nine remote-sync tests pass with that same timeout. No authorization, event history or assertions were weakened.

## Executed checks

| Check | Result |
|---|---|
| Node 22.16.0, browser + integration + architecture | **292 passed, 0 failed, 0 skipped** |
| Loaded Node source coverage | **96.70% lines, 83.87% branches, 97.06% functions** |
| Isolated SDK 8.0.400 locked .NET restore | Passed |
| SDK 8.0.400 Release .NET tests, net8.0 | **41 passed, 0 failed, 0 skipped** |
| SDK 8.0.400 locked spectator gateway restore/build | Passed; **0 warnings, 0 errors** |
| .NET Cobertura coverage | **1,440/2,289 lines (62.91%); 390/825 branches (47.27%)** |
| Audit Python trace line coverage | **80/83 executable lines (96.39%)** |
| Real StrictDoc 0.30.4 export | **2 documents, 6 stable IDs**, graph and HTML generation succeeded |

Node metrics include the loaded JS files from the wider combined test suite; they are not comparable to the narrower 256-test run as a code-quality improvement. Python trace used `--missing` so unexecuted statements count in the denominator. Its run covered the successful report path; exception-recording and threshold-rejection statements were unexecuted in that measured process. Separate tests execute threshold rejection and malformed integer CLI input. Python branch coverage is unavailable from the stdlib trace collector; coverage.py is not installed. Node coverage does not instrument the Python child process. TimekeeperWindow remains unexecuted by the .NET tests; source contracts and compilation are not runtime UI acceptance.

The .NET SDK was installed into ignored `out/tools/dotnet8` using Microsoft's [official installer](https://learn.microsoft.com/dotnet/core/tools/dotnet-install-script), `-Version 8.0.400 -NoPath`. Installed SDK reporting and successful locked builds/tests verify the usable local installation. No global PATH or global.json modifications were made. The installer warned that package-size comparison was unavailable; no independent archive checksum validation is claimed.

## Commands

From a verified checkout root (check with `Test-Path -LiteralPath (Get-Location).Path -PathType Container`), the main Node command was:

```powershell
npm exec --yes --package=node@22.16.0 -- node --test --experimental-test-coverage apps/rink-local/tests/browser/*.test.js tests/integration/*.test.js tests/architecture/*.test.js
```

Pinned SDK commands and directory checks are in `docs/build-and-release.md`; the test command additionally used `--collect 'Code Coverage;Format=cobertura' --results-directory out/verification/2026-10-28-dotnet8`. Python line coverage used `python -m trace --count --missing --summary --ignore-dir <resolved-Python-install-directory> --coverdir out/verification/audit-line-coverage tools/audit_code_docs.py --output out/verification/code-doc-audit-final.json`. The installed StrictDoc executable exported the two continuation requirement paths with `--no-parallelization --output-dir out/verification/strictdoc-final`.

## Adversarial evidence and remaining scope

Two syntax-valid audit mutations were killed by the new integration tests: replacing each file's missing count with zero; making an exceeded threshold return success. Copies were isolated in ignored `out/verification/audit-mutations/`; production source was never mutated. This two-mutant check is not an exhaustive mutation score. The combined suite reran existing temporal randomized checks (1,000 iterations, seed `0x1cebeef`) and endpoint negative checks (100 iterations, seed `0x1ce`); no counterexamples occurred. No Stryker.NET run or general-purpose fuzz campaign is claimed for this tooling-only follow-up.

Legacy documentation gaps remain findings, not a failing coverage gate. No live Frappe Bench, production ClamAV deployment, real Windows symlink acceptance, Avalonia interaction run or physical rink acceptance was performed. The final push's GitHub CI outcome must be checked separately; the first run's failure is retained above rather than overwritten by local results. Raw local evidence remains ignored under `out/verification/`.
