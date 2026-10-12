# IceBreaker v1.5 local source audit

- Monorepo source includes scorekeeper, local Node/SQLite backend, parent live tracker, league website, parent auth, team accounts and HTML manuals.
- v1.5 connects league game-day lineup confirmation to the rink authority's goal/assist/penalty validation when `ICEBREAKER_LEAGUE_GAME_ID` is configured.
- Unbound demo remains unchanged.
- Team season roster edits are blocked while an already confirmed scheduled/live lineup exists, pending an authorized amendment workflow.
- `npm test`: **74 passed, 0 failed**.
- `npm run docs:check`: **19 pages, 0 broken links**.
- C# compilation and production Google/OIDC/email integration: **not verified**.
- GitHub source publication: **not part of this local build**; use `PUBLISH_TO_GITHUB.ps1`.
- Remaining P0 design work: atomic permanent-player-ID snapshot and authoritative game assignment, correction permissions, offline trust.
