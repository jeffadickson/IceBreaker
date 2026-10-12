# Icebreaker requirements — StrictDoc

StrictDoc is the preferred long-term requirements tracker (Apache-2.0; plain text in Git; requirements-to-source/test traceability).

```powershell
py -m pip install strictdoc
strictdoc export requirements
strictdoc server requirements
```

`icebreaker-live.sdoc` is an initial machine-readable slice, **not** a migration of all 133 baseline requirements. Retain `requirements_v4_proposed_merged.csv` as the baseline until a full, checked migration is complete.

Requirement status must not be inferred from an unexecuted test or from the presence of code alone. See `traceability.csv` and `tests/browser/live-server.test.js`.
