# Contributing to IceBreaker

- Open an issue referencing a stable requirement ID before major behavior changes.
- Keep the rink's official event journal and the public projections separate.
- Never remove an event to repair history; append a correction referencing the original.
- Attach automated tests to each requirement and update `requirements/traceability.md`.
- Include both successful and adverse tests: duplicate command, offline/restart, stale event, invalid identity, mercy divergence, TBD scorer.
- No real youth names or live private game data in fixtures or screenshots.
- For manual changes, run `python tools/check_docs.py` and Node unit tests before proposing PRs.
- Keep generated artifacts separate from editable sources; never commit secrets.

## Reproducible build

See [build and release guide](docs/build-and-release.md). On a new machine run `python tools/icebreaker.py doctor`, then `bootstrap` and `check --configuration Release`.

Update dependency versions in the native manifests, regenerate and commit npm, uv and NuGet lockfiles in the same change. CI runs locked restores. Do not commit generated environments, binaries, credentials, or private player data.

Frappe Bench (Python 3.14 / Node 24) is a separate deployment from rink-local Node 22. A passing contract test does not substitute for live Frappe permissions testing. Use the manual Windows beta packaging workflow for unsigned test builds; production code signing remains required.
