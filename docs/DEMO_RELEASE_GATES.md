# Public demonstration readiness — IceBreaker (2026-10-12)

**Readiness judgment:** Suitable for a supervised, non-public, fictional-data prototype demonstration after a clean-machine smoke test. Not suitable for unattended public exposure, live youth data, or official league certification.

## Must pass before a stakeholder demo

| Gate | Proof / action | State |
|---|---|---|
| Source/CI | Clone from GitHub; Node, Elsa .NET, docs CI green | Needs GitHub CI run and local Elsa build |
| Operator journey | Start/stop clock, goals/TBD, assists, shots, penalties, undo via audit corrections | Needs browser E2E + manual dry run |
| League display | Same goal shown once in parent tracker; full score under mercy | Needs multi-device smoke test |
| Game lifecycle | Game end, provisional scoresheet, referee correction and fresh signed revision | Development path exists; live end-to-end demo check needed |
| Workflow runtime | Elsa receives event and persists receipt; Node approval journal unchanged | Elsa host C# build and restart test pending |
| Local sync | Disconnect/reconnect without double scoring or losing shots | Existing test coverage; real network disruption exercise pending |
| Accessibility/mobile | Touch check on iOS/Android, readability, input focus | Not measured |
| Privacy | Only fictional players; do not expose private audit/keys | Must enforce for demo |
| Demo deployment | Only localhost/VPN; no public HTTP operator access | Required |

## Required for an actual public pilot with minors

- HTTPS, real operator/manager/referee identity onboarding, authorization penetration review, session and credential rotation.
- Youth-data publication policy, guardian consent and opt-out, retention/deletion processes, email deliverability controls.
- Idempotent background bridge worker, retry backoff, monitoring, durable workflow migration/compatibility tests.
- Event-contract versioning and schema migrations, backup/restore verification, observability and alarms.
- Real-browser E2E (Chromium/Firefox/WebKit) and mobile checks; rink clock/penalty timing hardware validation.
- Official league approval of electronic scoresheet and signature procedure; league ruleset certification.
- Production database decision, multi-tenant data isolation, rollback/upgrade, disaster recovery, basic abuse prevention.

## Important truth boundaries

Elsa service v2.8 is a **durable event-observer adapter**, not yet a human approval state machine with bookmarks or Elsa Studio designer. Original IceBreaker signing and certification logic remains authoritative. The two SQLite databases are independent, so a power failure between workflow execution and receipt completion can cause an activity to run twice. No external side effects may be entrusted to Elsa activity execution without business-level idempotency.