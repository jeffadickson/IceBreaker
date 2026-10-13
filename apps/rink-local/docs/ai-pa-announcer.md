# Native IceBreaker PA — offline and optional AI voices

The Windows timekeeper has a **manual-approval** announcement queue. The rink authority remains the sole source of truth; the PA service only reads committed goal/penalty events from the snapshot and never changes game state.

## Operator workflow

1. Start `START_ICEBREAKER_DESKTOP_WINDOWS.cmd`; use the **PUBLIC ADDRESS** section.
2. After a committed goal or penalty, select the generated script. Scorer/assists, jersey number, penalty duration and infraction come from the authoritative journal. Unknown scorers are announced as to-be-announced. Custom penalty descriptions are spoken generically rather than transmitting arbitrary text that might contain a minor's personal information.
3. Choose **Offline Windows voice** (default, no internet) or **AI arena announcer (cloud)**, then choose an AI voice (onyx, marin, cedar, echo, alloy or nova) and a delivery style (classic arena PA, high-energy, or calm and precise).
4. Select **PREVIEW / PLAY SELECTED** to generate and play the selected announcement on the Windows default audio output, or **SKIP SELECTED**. Route the laptop's output to the rink PA mixer and sound-check levels before use. Preview and Play are the same operation in this development UI; **do not press it with arena speakers live unless you intend to broadcast**.
5. On restart, previously interrupted playback is marked **NEEDS_REVIEW** rather than replayed automatically. The queue stores committed event IDs and ignores duplicates.

## Optional AI speech setup

The cloud provider is **OpenAI's speech synthesis API**, currently using `gpt-4o-mini-tts` with WAV output. It requires internet access and incurs provider usage costs. Set `OPENAI_API_KEY` in the desktop process environment using an approved secret-management method, not in source code or league settings. Do not include the key in screenshots, logs or support tickets. The key is never sent to the rink authority or central league backend.

Only the selected script and voice/style instructions are sent to the AI provider **when the operator chooses Play**. By default scripts contain jersey numbers, not minors' names. The AI output is synthetic; avoid voices that impersonate identifiable real announcers without authorization. The local offline voice remains available if the AI service fails.

## Current scope and release gaps

- Goal and penalty scripts are generated from committed events; not from draft entries. Manual approval is the only playback mode.
- The queue is durable and event-idempotent, and uncertain in-flight playback is quarantined.
- Audio is output through the default Windows device. Output-device selection, gain control, arena speaker routing, ducking/music mixing and physical sound checks are not yet implemented.
- Scoring corrections, final-minute calls, custom team names, and detailed league PA policy still need native queue integration. The separate C# announcement planner already defines those event types.
- Cloud audio has not been exercised with live credentials, and actual speaker playback has not been tested on a rink laptop. Never treat compilation or mocked unit tests as a successful PA sound check.
- No automated AI playback is enabled. A failed AI request does not alter the official game journal; the operator can switch to the offline voice.
