# CERT — Correction and resubmission (v2.5)

- CERT-025 (P0): A referee's correction request SHALL supersede the submitted revision and retain the original document digest and decision.
- CERT-026 (P0): An authorized operator SHALL correct a game-ending journal only via an explicit postgame correction command, with mandatory original event reference, reason, identity, and idempotency key.
- CERT-027 (P0): Resubmission SHALL create a new immutable scoresheet revision with new source sequence and SHA-256 digest; the prior revision SHALL remain inspectable.
- CERT-028 (P0): A referee SHALL only certify the current submitted revision and matching digest, requiring a fresh explicit approval after changes.
- CERT-029 (P0): A game correction SHALL NOT silently alter official scores or shots; non-attribution corrections need separate reviewed domain commands.
- CERT-030 (P1): Workflow transitions SHALL ultimately be driven by a versioned Elsa definition; JSON policy files are currently declarative documentation, not executable Elsa workflows.

## Acceptance scenarios
1. End game, submit v1, referee requests correction, authorized operator corrects scorer, submit v2, sign v2, verify v1 superseded and both journals retained.
2. Attempt correction without referee request -> rejected.
3. Attempt stale digest signing or resubmit same draft -> rejected or idempotently returns current revision.
4. Attempt unapproved score change after end -> rejected.

Current status: Node/SQLite workflow implementation, not integrated with Elsa runtime. Multi-official review, publication, and production access control remain future work.