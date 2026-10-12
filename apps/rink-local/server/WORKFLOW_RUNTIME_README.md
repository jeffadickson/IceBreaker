# Executable scoresheet workflow (v2.6)

The workflow is now **executed by `workflow-runtime.js`** using the checked-in `config/workflows/electronic-scoresheet-v2.5.json` state/role/action transitions. This runtime is NOT Elsa. A running game pins workflow version and SHA-256 definition digest. SQLite holds durable state and revisioned transition history. Each signed approval queues `LEAGUE_PUBLICATION` and `PARENT_REPORT` intents.

`GET /api/scoresheet/v1/workflow` (operator auth) reveals state/history/outbox. `POST /api/scoresheet/v1/deliver` (operator auth, development only) attempts to publish the certified snapshot against `ICEBREAKER_LEAGUE_GAME_ID` and enqueue emails. Actual outgoing email transport does not exist. Errors are marked BLOCKED, not silently delivered. League post-certification amendments are blocked rather than overwriting official results.

Keep v2.6 tests alongside all existing rink tests. Never expose this Node development server directly to the internet.