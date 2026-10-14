# IceBreaker code documentation standard

Status: adopted for new and modified code. Repository-wide compliance **not yet verified**.

## Required documentation

- Every exported/public function, class and interface must have a useful documentation block (JSDoc for JavaScript/TypeScript, XML `///` for C#, docstring for Python).
- Document purpose, input/output contracts, side effects, exceptions or error behavior, authorization requirements and concurrency/retry semantics when applicable.
- Internal functions with non-obvious behavior, security boundaries, data migrations, timekeeping, audit, or offline recovery also require documentation blocks.
- Add line comments to explain **why** a decision is made, invariants, trust boundaries and surprising edge cases; avoid narrating obvious syntax or adding a comment to every statement.
- All authorization and privacy-sensitive code must identify the trusted data source and fail-closed behavior.
- Tests should name the requirement/invariant they protect, with a comment for complicated fixtures.
- Keep documentation synchronized with implementation; remove stale claims. Do not include secrets, youth PII or operational credentials in examples.
- Treat the source, tests and rendered UI as separate verification dimensions. Documentation coverage is not proof of correctness.

## Repository-wide verification plan

1. Inventory all tracked source files by language, excluding generated, vendored, lockfile and binary artifacts.
2. Run language-aware analysis for exported functions and public APIs missing blocks; prioritize server/auth, rink clock, penalty rules, certification, recovery, database migrations and Frappe bridges.
3. Manually review misleading or outdated comments, not just comment counts.
4. Add CI checks incrementally, initially reporting violations without failing legacy code; gate newly introduced exported functions first.
5. Record counts by module and link remediation issues. Only claim full compliance after scanning the exact commit and reviewing exceptions.

## Definition of done

No newly exported API without a documented contract. No sensitive control-flow change without an explanatory comment. Public documentation and acceptance claims must identify unverified field tests.
