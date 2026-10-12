# Icebreaker Automated Public Address Announcer — v0.2 design

## Product behavior

Optional, per-rink configurable PA announcer for committed goals, penalties, attribution corrections, one minute remaining, period end, and eventually game end, warmups, sponsor messages, and lineup introductions. Support distinct public-address and operator-preview outputs. An operator can approve, cancel, edit, replay, or mute an announcement without changing the official event journal.

## Reliability and authority

- The game engine NEVER waits for speech synthesis or playback; PA subsystem is a separate asynchronous consumer of committed events.
- Persist an announcement outbox in SQLite with a unique announcement ID, source event ID, rendered script, approval state, delivery state, attempt count, and timestamps. The planner in this version produces stable IDs; outbox persistence is NOT implemented yet.
- A normal countdown crossing of 60 seconds emits a period-specific stable ID; clock SETs do not trigger announcements. Deduplicate against durable outbox. Do not announce until the authoritative game clock is running and a real crossing has been observed.
- No AI voice service may change game data, infer TBD players, or generate new factual content. LLM-authored commentary is optional and requires a strict facts-only template and human approval; TTS is the default.
- Cancel or supersede queued announcements after a goal is voided or attribution is corrected; avoid announcing stale queued facts. Never interrupt a penalty announcement with a routine message.
- Duck background music, play horn/siren before a goal announcement only when configured, and avoid overlapping announcements. Hardware output is configurable and isolated from operator speakers.
- Roster display names require explicit venue/league privacy policy; youth players are number-only by default. Hosted AI services may transmit player data, so opt-in and privacy review are required.
- Offline OS TTS is the default; optional AI TTS provider is a replaceable adapter with cached audio, explicit network timeout, and local fallback. Windows System.Speech or Windows.Media.SpeechSynthesis integration is a future platform-specific package.

## Implemented in this package

- Pure deterministic C# planner for goals, penalties, corrections and one-minute/period-end cues.
- Configurable automatic/manual/disabled policies.
- Privacy-first number-only player formatting, TBD-aware scripts, stable announcement IDs, and speech/output adapter interfaces.
- Five xUnit tests (not executed in this environment).

## Still to implement

- Durable announcement outbox, delivery/approval UI, cancellation/supersession, local OS TTS, optional hosted TTS, playback mixing/ducking, exact-once announcement delivery under crash/restart, authoritative monotonic clock crossing detector, game end and final score, horn hardware integration, queue ordering, audio device selection, speech preview and pronunciation dictionary, voice language selection, profanity filtering, youth privacy policy integration, and end-to-end tests.

## Proposed acceptance requirements

- PA-001: Optional and configurable announcement triggers per rink/game.
- PA-002: All announcements originate from committed game events or authoritative clock transitions.
- PA-003: Stable unique IDs and durable deduplication prevent repeated announcements after restart.
- PA-004: Manual approval/edit/cancel/replay, with immutable history of the announcement actually spoken.
- PA-005: Offline speech is available without internet; optional AI TTS fails over gracefully.
- PA-006: TBD players are never guessed; correction announcements reference verified attribution.
- PA-007: Final-minute announcement is emitted at most once per period during a genuine running countdown.
- PA-008: PA synthesis and playback cannot block scoring, clock, or event persistence.
- PA-009: Youth name disclosure and cloud voice processing require explicit privacy settings.
- PA-010: Output routing, horn/music coordination, priority queue, and cancellation avoid overlapping or stale announcements.
