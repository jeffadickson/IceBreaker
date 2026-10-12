# IceBreaker lightweight workflows (default)

**Decision:** IceBreaker uses its existing embedded Node.js/SQLite workflow runtime. There is no separate workflow service, workflow database, scheduler, designer, or Elsa installation in the default deployment.

## How it works

- Workflow definition: `config/workflows/electronic-scoresheet-v2.5.json`.
- Interpreter: `apps/rink-local/server/workflow-runtime.js`.
- Persistence: SQLite `workflow_instances` and `workflow_history` in the existing game database.
- Side effects: durable `certification_delivery_outbox` for league publication and parent report requests.
- Security: authentication, authorization, signed-revision checks, and audit logging are enforced by application code. Editing the workflow file cannot bypass them.
- A game pins its workflow ID, version and definition digest. Updating a workflow changes **new** games only; ongoing games require an audited migration.

## Default setup

```powershell
node apps/rink-local/server/rink-server.js
node --test apps/rink-local/tests/browser/workflow-runtime.test.js
```

No environment variables or external services are needed for workflows. **Do not set `ICEBREAKER_ENABLE_ELSA_BRIDGE`** unless intentionally testing the archived integration.

## Optional experiment retained

The Elsa proof of concept remains in `services/elsa-workflows/` as historical, explicitly opt-in research. It is not part of default CI or deployment. To run it deliberately, set `ICEBREAKER_ENABLE_ELSA_BRIDGE=1` and configure that bridge per its own documentation. Its results do not determine game authority or certification.

## Next small improvements

1. Schema validation and a negative-case test matrix for each league policy.
2. A read-only workflow progress visualization in the manager/referee web views.
3. Tested role-specific notifications and delayed-task reminders using the existing durable outbox, with no additional service.

## Sport-neutral boundary

Shared workflow steps deal with identities, documents, approvals and publication. The sport module supplies the score schema and game-specific eligibility rules. Hockey-specific events do not belong in the generic workflow runtime.
