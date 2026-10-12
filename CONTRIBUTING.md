# Contributing to IceBreaker

Read [AGENTS.md](AGENTS.md) for project-wide instructions, invariants, privacy controls, and required verification.

## Development workflow
1. Open or link an issue with stable requirement IDs for substantive behavior changes.
2. Update your local `main` and create `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, or `chore/<topic>`.
3. Make focused changes with unit, negative, and integration tests. Link tests and source to requirements in `requirements/traceability.md`.
4. Update relevant HTML manuals whenever controls, APIs, or operational behavior change.
5. Run the checks below locally where tooling is available, then open a PR against `main`.
6. Review CI failures, resolve feedback, and merge only after required checks pass and review is complete.

## Local checks
```sh
npm test
python tools/check_docs.py
dotnet test apps/rink-local/tests/Icebreaker.Core.Tests/Icebreaker.Core.Tests.csproj -c Release
```

The CI workflow executes all three on each PR. A local inability to run a check must be noted honestly in the PR and does not count as passing.

## Requirements and safety
- Keep game event history immutable; append corrections rather than editing prior events.
- Every meaningful game action must enter the private low-level operator audit, including canceled drafts.
- Spectator projections show the full official score, even with arena mercy caps.
- Preserve stable player IDs and the difference between TBD and None.
- Do not include identifiable youth data, credentials, private audit logs, or live production records in fixtures.
- Test error conditions: unauthorized access, duplicate requests, stale revisions, offline/restart recovery, and invalid team/roster attribution.

## Pull requests
Complete the PR template. Include changed requirement IDs, test commands and results, privacy/security considerations, migrations, and screenshots for UI changes. No direct pushes to `main` in normal development. Never force-push `main`.

## Current maturity
Some components are development prototypes. Proposed remote-device authentication, certified-signature workflows, email delivery, and production deployment must not be presented as implemented or validated until proven in code and CI.
