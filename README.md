# IceBreaker

**Hockey-first, sport-extensible scoring, rink operations, and league management.**

> **Status: development prototype.** The Node.js local server and C# components are not yet one unified production authority. No public-internet deployment or game certification is supported. Sample teams/results are fictional.

## Native Windows timekeeper (development)

Run `START_ICEBREAKER_DESKTOP_WINDOWS.cmd` on a Windows laptop with Node.js 22.13+ and .NET SDK 8+. This launches a **native Avalonia desktop window** and a **separate local authority process**; no browser is needed for timekeeping. Closing the window does not stop the independent authority. The app reconnects from authoritative snapshots, and displays a disconnected warning rather than guessing time when the backend is unavailable.

See [native timekeeper guide](apps/rink-local/docs/native-timekeeper-desktop.md) and [desktop requirements](requirements/desktop-timekeeper.md). GitHub CI compiles the native app and publishes a Windows x64 artifact. The current shared development operator key, incomplete hardware drivers and unperformed physical-machine crash testing mean this is **not yet a production deployment**.

## Optional AI arena announcer

The native Windows timekeeper has a manual-approval PA queue for committed goal and penalty events. Select the **Offline Windows voice** (default) or an optional **AI arena announcer** voice, then choose an announcement to play or skip. The AI voice requires an `OPENAI_API_KEY` in the desktop process environment and internet access; it does not alter scoring or send credentials to the rink backend. Player jersey numbers are used by default, not youth names. See [AI PA announcer guide](apps/rink-local/docs/ai-pa-announcer.md) and [requirements](requirements/ai-pa-announcer.md). Arena speaker playback and cloud provider integration still need physical acceptance testing.

## Player identity and annual compliance (development)

The league now has a permanent player registry independent of team/season membership, with private birth date/address records, linked related people, season-by-season roster history, and annually verified training requirements. Training eligibility is checked at game-day lineup confirmation and again before game start. See [player identity and compliance requirements](requirements/player-identity-and-annual-compliance.md).

**Do not enter real minors' private information in the development database.** Production registrar authentication, encrypted storage, access auditing, secure backup/retention, and guardian-consent workflows remain to be completed. The private registry currently has internal APIs, not a production registrar portal.

## Club and league registration web portals (development)

Open `http://127.0.0.1:8090/registration.html` after starting the rink-local server. Scoped **club registrars** create private player profiles, add parent/guardian contacts, submit annual team registrations, preview CSV imports, and propose season rollovers. **League administrators** review/approve/reject submitted rosters and manage annual training requirements. A player keeps the same permanent ID when changing teams or divisions. Team managers can edit game-day lineups but cannot bypass league approval for club-managed season rosters.

See [portal setup and development bootstrap](apps/rink-local/docs/club-league-registration.md) and [requirements](requirements/club-league-registration.md). **Do not use real minors' PII** until production encryption, guardian consent, MFA, secure backups and registrar access review are completed.

## Family accounts and encrypted documents (development only)

IceBreaker now includes a separate [family registration page](apps/rink-local/web/family-registration.html), verified per-child guardian grants, contact details and preferences, and a development encrypted document vault for PDF/PNG/JPEG test files. Each file uses a unique AES-256-GCM key wrapped by a separate local KEK; uploads are quarantined until an independent malware scanner is integrated. Private player and related-person fields can be encrypted on new writes when `ICEBREAKER_PRIVATE_FIELD_KEY_BASE64` is configured.

**Do not upload real birth certificates or children's personal information.** Production mode intentionally refuses to start private registration until KMS, malware scanning, MFA, verified consent, encrypted legacy-data migration, and secure backups are implemented. See [security design](apps/rink-local/docs/private-data-security-design.md) and [requirements](requirements/private-data-and-documents.md).

## Private registration security hardening (development)

New backend-only [ClamAV quarantine scanner](apps/rink-local/server/scan-quarantine.js), [offline legacy PII migration](apps/rink-local/server/migrate-private-fields.js), [offline document key rotation](apps/rink-local/server/rewrap-document-keys.js), and opt-in encrypted staff TOTP MFA are implemented. The [security design and operations guide](apps/rink-local/docs/private-data-security-design.md) explains key configuration, dry runs, verified backups, and acceptance testing.

**Production registration is still disabled** until KMS, encrypted backup/restore, scanner deployment, mandatory MFA/recovery, verified guardian consent and full legacy-data protection are complete.

## Launch

- **Browse the complete HTML manual:** open [`docs/site/index.html`](docs/site/index.html).
- **Windows:** double-click `START_ICEBREAKER_WINDOWS.cmd`.
- **Run the local rink, parent live, and league demo:** install Node.js >=22.13; run `node apps/rink-local/server/rink-server.js` from the repository root; visit `http://127.0.0.1:8090/operator.html`, `/live.html`, and `/league.html`.
- **Run Node test suite:** `node --test apps/rink-local/tests/browser/*.test.js`.
- **Run .NET tests when .NET SDK 8+ is installed:** `dotnet test apps/rink-local/tests/Icebreaker.Core.Tests/Icebreaker.Core.Tests.csproj`.

See [DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md) for source inventory, incomplete features, and safe push procedure.

## Repository map

| Folder | Contents | Status |
|---|---|---|
| `apps/rink-local/` | Existing Node/SQLite prototype, browser UI, experimental C# libraries/gateway, tests | Implemented prototype |
| `docs/site/` | Offline HTML manuals, architecture, workflows, safety, deployment, testing | Included |
| `requirements/` | StrictDoc requirement files and proposed workflow policies | Mixed accepted/proposed; see individual files |
| `config/` | Example deployment and workflow configurations | Templates only |
| `contracts/` | OpenAPI starter contract and reference SQLite schema | Included, not complete coverage |
| `research/source-audit/` | Repository feature comparison and proposed v4 requirements | Included |
| `docs/specifications/` | Archived product/system/verification/implementation DOCX plans | Included |
| `tools/` | Local integrity and link check utilities | Included |
| `.github/workflows/` | CI for Node tests and docs links; separate .NET tests | Configured; run results depend on GitHub |

## Workflow engine

**Default: embedded and lightweight.** Electronic scoresheet submission, correction, referee approval and result publication are coordinated by the existing version-pinned JSON interpreter and SQLite records in the rink backend. No Elsa server is required. See [lightweight workflow guide](docs/LIGHTWEIGHT_WORKFLOWS.md). The Elsa experiment under `services/elsa-workflows/` is optional and excluded from normal CI and deployment.

## Engineering principles

1. SQLite authoritative rink journal; no silent overwrites or clock extrapolation.
2. All accepted game events are immutable; corrections are new events. Operator actions have a private, low-level audit trail.
3. Parent live tracking shows **full actual score and all approved goals**, even under mercy rules. Arena display may be capped.
4. Local/offline support takes precedence over optional speech providers and cloud availability.
5. Certification must prove assigned-game authority, complete event sequence, scoresheet revision, and an authorized referee approval.
6. Youth privacy, access control, and opt-in notifications are release blockers.

## Maturity

**Running prototype:** local rink scorekeeper, parent tracker, league demo, persistent Node SQLite server and tests. **Partial/proposal:** C# engine, certified results, workflow policies, online spectator gateway. **Not yet implemented:** remote station authentication and sync, Elsa runtime, electronic sign-off, parent accounts/email, production deployment.

## License and assets

Original project code is intended for Apache-2.0 licensing **subject to ownership/licensing review before publication**; artwork, team identities, and product trademarks are not granted under that intent. The bundled prototype includes previously generated code; review ownership, dependencies, and `LICENSE` before publishing. Third-party audit reference repositories are **not included**.

## Release gates

See [verification manual](docs/site/testing.html) and [security manual](docs/site/security.html). Do not expose the development operator key or HTTP server publicly.

## Parent accounts (development preview)

Open `http://127.0.0.1:8090/parent.html` after `npm start`. Supports password registration, verification tokens queued in SQLite, server-side sessions, Google OIDC code+PKCE (when configured), saved favorites, and report preferences. **Outbound verification mail, end-of-game reports, account recovery, and production deployment are not complete.** See `docs/site/parent-auth.html` and `requirements/parent-accounts/requirements.md`.

## v1.3: shots, penalties, unofficial reports

The local server exposes `/api/games/demo/unofficial-report`, `/api/games/demo/unofficial-report.json`, and `/api/league/v1/penalty-frequency`. Penalty rankings are **local journal statistics**, not yet a centralized certified-league ranking. See `requirements/scorekeeping-v1.3.md`.

## Team Manager portal (v1.4 development preview)

Open `/team.html` from the running rink server. The backend provides separate team login, team-scoped season roster updates and signed-in game-day lineup confirmations. A development league operator can provision a team account through `POST /api/team/v1/admin/accounts`. See `requirements/team-accounts-v1.4.md`. This is not production-ready identity management.

## v1.5: Game-day roster validation (development opt-in)

Set `ICEBREAKER_LEAGUE_GAME_ID` to the ID of a scheduled game in the local league database before starting the rink backend. Then the operator may inspect `http://127.0.0.1:8090/game-rosters.html`. Once bound, goals, assists, their corrections, and player penalties require both teams to have confirmed lineups. Jersey numbers are checked against the confirmed snapshot; TBD remains valid. The normal unbound demo retains its original behavior. This prototype uses one bound game per backend instance; it does not yet support multi-rink production game assignment or the administrator late-amendment workflow.

## v1.8: operator readiness and lineup-based fast entry

The rink scorekeeper displays database-backed sync outbox counts, event-mirror health, and game-day roster readiness. When the server is bound to a league fixture and both lineups are confirmed, jersey-number quick-pick buttons use the confirmed lineups instead of fixed demo rosters. TBD is always available. The status endpoint `/api/operator/status` requires the development operator credential. See `requirements/scoring-operator-readiness-v1.8.md`. The interface is still a development prototype; it is not authenticated for public deployment.

## v1.9 broadcast video overlay (development)

Open `http://127.0.0.1:8090/overlay.html` as a 1920×1080 browser source in OBS Studio or vMix. The page is transparent and renders the game clock, period, both scores, **both shots-on-goal counts**, and current penalty/strength indicators. Use `?layout=compact` for a slimmer scorebug or `?mode=arena` for the mercy-capped arena score; the default **full** mode never applies mercy score masking. The overlay is a local-only, read-only browser source and does not ingest or encode video. See `requirements/video/broadcast-overlay.md` for requirements and capacity validation gates.

## v2.3: Camera scoreboard observer and manager checklists (experimental)

- `tools/scoreboard-camera/`: OpenCV seven-segment camera capture/OCR, field confidence, mismatch flags, calibration example, synthetic tests. **Observations only**; never changes official scoring data.
- `config/workflows/scaha-manager.json`: Proposed configurable exhibition, tournament and SCAHA league-game procedures, each with required evidence types.
- `src/team-workflows/manager-checklist.js`: Versioned policy validation, task evidence recording, append-only checklist projection and reopening.
- `docs/site/manager-workflows.html`: HTML manager manual.
- `requirements/manager-camera-v2.3.md`: Requirement IDs, tests and integration limitations.

These modules are testable proofs of concept, **not yet integrated into the authenticated team-manager backend or camera control panel**. Verify current league policies and obtain the official blank exhibition scoresheet from the SCAHA Manager Tools page.

## v2.4: Electronic scoresheet review (development slice)

After `GAME_ENDED`, the scorekeeper can submit a hashed, immutable electronic scoresheet revision. An individually provisioned referee signs in at `/referee-review.html`, reviews goals/assists, penalty types and shots, and approves the exact revision or requests a correction. The individual referee's login is separate from the operator key. See `requirements/certification/electronic-scoresheet-v2.4.md` and `apps/rink-local/tests/browser/scoresheet-certification.test.js`.

**Not production certification:** This release lacks the full correction/resubmission loop, legally reviewed electronic signatures, automatic final publication into the league database, configured multi-signer workflows, and TLS-hardened public identity infrastructure. Keep the HTTP server on loopback.