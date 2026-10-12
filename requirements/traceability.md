# Release traceability gate

| Requirement | Intended evidence | Current state |
|---|---|---|
| LOG — private low-level actions | Node `rink-backend.test.js`; C# OperatorActionLogTests | Development tests; not full durability proof |
| SCORE — confirmed goals/assists, TBD/correction | Node `rink-backend.test.js`; C# GameStoreTests | Development tests |
| LIVE — full-score spectator projection even in mercy | Node `rink-backend.test.js`, `full-score-policy.test.js` | Development tests |
| LEAGUE — certified stats and standings | Node `league-store.test.js` | Development tests, demo data |
| SYNC — authenticated remote stations | future adversarial integration test suite | Not implemented |
| CERT — signed ref approval | future hash, credential, replay & policy tests | Not implemented |
| PARENT — account/favorites/email | future privacy, opt-in, recipient and delivery tests | Not implemented |

Requirements in existing `.sdoc`/`.csv` registers remain authoritative where accepted. Names above are feature groups, not replacements for existing requirement IDs.
