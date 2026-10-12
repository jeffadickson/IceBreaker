# IceBreaker completeness audit — 2026-10-12

## Measured contents

- The prior v1.5 ZIP was **2,288,936 bytes** (2.18 MiB), **151 files**, **2,707,028 bytes unpacked**.
- Four PNG files contributed **1,916,394 unpacked bytes**; two screenshots were copied into both web assets and manuals.
- Source files are small because this is an early prototype. The JavaScript, HTML, and C# files together contain about **377 KB** of source.
- All 151 working-tree files matched the original ZIP by filename and uncompressed size; archive CRC checks passed.
- v1.5 had exactly three new files compared with v1.4; there were no files removed between those revisions.
- The v1.3 standalone report preview had been omitted in the v1.4/v1.5 consolidation. This corrected package restores it under examples/standalone-demos.
- Earlier standalone live and league web demos, and the v2/v3 documentation packages, are now included separately as historical/reference artifacts.

## Included application areas

- Rink-local Node.js/SQLite server and tests
- Browser scorekeeper, league site, parent tracker and authentication, team manager, game rosters
- C# domain prototype and spectator gateway scaffold, and xUnit source tests
- Requirements, API YAML, sample policies and historical spec packages
- HTML manuals and CI, Windows publishing script

## Not yet built or production-verified

- Separate, production deployable central multi-rink backend; remote station credential provisioning; certified cross-rink ingestion
- Production first-party standalone identity service and SMTP delivery, end-of-game report email delivery
- Referee electronic signing / Elsa workflow execution
- Native Avalonia scorekeeper integration and physical scoreboard drivers
- Complete shot correction, goalkeeper stats, league-global penalty recommendations
- C# build/test execution and browser end-to-end acceptance

Node test suite was exercised separately; source and runnable tests are included but passing tests do not imply production readiness. This archive is a **complete snapshot of assembled local files**, not a completed product.
