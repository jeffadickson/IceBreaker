# Identity policy development verification — 2026-10-24

Base: `9270915`. Runtime: Windows, Node v24.20.0. The repository requires Node 22; these results do not establish acceptance on the pinned runtime.

## Change and traceability

`requirements/identity-policy.sdoc` formalizes existing ID-012 for the pure `can` policy in `apps/rink-local/server/identity-policy.js`. Non-finite and non-number evaluation clocks now deny all grants. Previously NaN bypassed the expiration comparison. Expiry remains exclusive: authorization is denied at the exact expiry instant.

Repaired a literal backslash-n in `identity-policy.test.js` that prevented the existing superuser regression tests from parsing.

## Executed evidence

- `node --test --experimental-test-coverage apps/rink-local/tests/browser/identity-policy.test.js`: 8 passed. Module line coverage 100%, branch coverage 86.21%, function coverage 100% (Node built-in instrumentation). Remaining branches and other modules are not fully measured by this focused run.
- Negative clock inputs: NaN, positive/negative infinity, null, string, object, array and boolean; expiring and non-expiring grants both denied.
- Temporal boundary cases: expiry minus one millisecond, exact expiry, expiry plus one millisecond.
- Randomized property: 1,000 time offsets, LCG seed `0x1cebeef`, authorization equals `evaluation < expiry`. No counterexamples; minimization was unnecessary. This is bounded temporal fuzzing, not a general interface fuzz campaign.
- Two isolated targeted mutations were detected by failing tests: removal of the finite-clock guard; changing expiry rejection from `<=` to `<`. This is a two-mutation check, not an exhaustive mutation score. Production source was never mutated during this check.
- `node --test apps/rink-local/tests/browser/*.test.js`: 254 tests, 248 passed, 6 failed. Failures: timing database cleanup EPERM; Frappe cache symlink EPERM; three ClamAV Unix socket fixtures EACCES; native roster source contract expects `LoadRosterSuggestionsAsync("home")` absent from the current source. These failures are outside the modified policy module; no clean full-suite claim is made.
- `git diff --check`: passed.

Raw suite and focused coverage logs are in ignored `out/verification/`. StrictDoc CLI validation was not run because StrictDoc is unavailable in this environment. No .NET code changed; .NET build and physical rink acceptance were not run. Endpoint enforcement, trusted clock provenance, live OIDC and production identity acceptance remain separate work.
