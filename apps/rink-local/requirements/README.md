# Icebreaker requirements — StrictDoc

StrictDoc is the preferred long-term requirements tracker (Apache-2.0; plain text in Git; requirements-to-source/test traceability).

```powershell
py -m pip install strictdoc
strictdoc export requirements
strictdoc server requirements
```

`icebreaker-live.sdoc` is an initial machine-readable slice, **not** a migration of all 133 baseline requirements. Retain `requirements_v4_proposed_merged.csv` as the baseline until a full, checked migration is complete.

Requirement status must not be inferred from an unexecuted test or from the presence of code alone. See `traceability.csv` and `tests/browser/live-server.test.js`.

## Migration gap report

From the repository root, run:

```bash
node apps/rink-local/tools/requirements-status.js
```

This emits JSON counts, overlapping StrictDoc IDs, conflicting statements, missing traceability rows, and unmigrated v3 baseline IDs. The current live/league documents have eight overlapping LEAGUE IDs with divergent descriptions; **do not automatically deduplicate or treat one as authoritative**. The existing `requirements.test.js` only gates `icebreaker-live.sdoc`, not all baselines. The diagnostic intentionally reports existing debt rather than failing CI until IDs are reconciled.

A traceability row or passing file-existence check is not proof of successful verification. Production release still requires each accepted P0 requirement to have an executed, recorded acceptance test and release evidence.
