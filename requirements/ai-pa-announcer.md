# IceBreaker PA — optional AI announcer voice
Status: development integration. This is **audio downstream of the game journal**, never a scoring authority.

- PA-101 P0: The timekeeper SHALL offer OFF, local offline voice, and optional hosted AI voice, with a clearly labeled provider and selected voice.
- PA-102 P0: Goal and penalty scripts SHALL derive only from committed authoritative events, including scorer/assists and penalty duration; corrections SHALL never silently overwrite or automatically replay an earlier announcement.
- PA-103 P0: Default SHALL be manual operator approval. Provide Preview/Play and Skip; no announcement shall automatically transmit to arena PA after restart.
- PA-104 P0: Scripts SHALL use jersey numbers by default and SHALL NOT transmit minor full names to an AI service without explicit, league-authorized consent.
- PA-105 P0: API credentials SHALL come from local environment/secure deployment configuration; never include secrets in public event feeds, Git or central sync.
- PA-106 P0: Cloud voice failure SHALL not block clock, penalties, scorekeeping or local event journaling; operator may select offline voice.
- PA-107 P0: Audio shall play through the Windows-selected output device; arena PA routing and output levels require an operator sound check.
- PA-108 P0: The UI SHALL label AI-generated speech as synthetic and SHALL NOT imply it is a live human announcer or imitate a real person's distinctive voice without permission.
- PA-109 P1: Queue announcements with stable source-event IDs; duplicate event replay or reconnect SHALL NOT create duplicate pending announcements.
- PA-110 P1: Support an optional voice-specific announcer style instruction, capped to prevent accidental sending of arbitrary long/private content.
- PA-111 P1: Allow league-controlled enablement and audit play/skip/approval actions.
- PA-112 P0: Test no-cloud fallback, duplicate suppression, input validation, restart recovery and disconnected authority behavior.

Initial implementation uses an OpenAI-compatible speech endpoint for WAV output, plus Windows local speech. The AI voice is **opt-in** and requires internet. The local default is offline. The desktop PA queue is local and manual; production role-based controls, output-device selection, league consent management and full arena sound tests remain release blockers.
