# Icebreaker v0.4 integration notes

## New operational path

`GameSession` wraps `GameStore` (authoritative SQLite events), `MercyRules` (policy),
`MonotonicGameClock` (display samples), and `AnnouncementOutbox` (durable PA staging).

1. Record goal with TBD or roster IDs -> commit official goal -> stage announcement
   idempotently -> evaluate and journal `MERCY_MODE_CHANGED` if the threshold crosses.
2. Public scoreboard uses `PublicGameView`, which caps the **displayed** score only;
   `OfficialView` retains every goal and the uncapped official score.
3. A stop request checks mercy policy. An ordinary whistle during running-clock
   mercy is recorded as `CLOCK_STOP_IGNORED`; injury, official timeout, period end,
   game end and operator safety stop still stop the clock.
4. A clock START, STOP, or SET is journaled. The in-process display uses monotonic
   elapsed time between actions. A restart records an explicit STOP at the last
   committed seconds and resumes **paused**; no downtime is extrapolated.
5. Announcements are staged by committed event ID. A crash or restart moves
   unplayed automatic `Ready` and uncertain `Playing` announcements to
   `NeedsReview`; an operator must explicitly approve before playback.
6. League mercy policy and home/away mapping are pinned in SQLite and cannot
   silently change on reopening the game.

## Reliability and incomplete work

- `GameSession` serializes calls in one process. There is no cross-process
  writer lease/fencing yet. Do not open two operator instances against one game.
- A goal journal commit and PA staging are not in one transaction. Restart
  reconciliation repairs missing PA queue entries, quarantining them for review.
- A goal journal commit and derived mercy transition are not atomic. Restart
  reconciliation repairs a missing transition, and the official score remains
  authoritative throughout.
- No actual speech synthesis, sound-card playback, hardware scoreboard driver,
  Avalonia UI, API, or network synchronization is included.
- `MonotonicGameClock` is a new reusable clock component. The session uses it
  for live public samples, clock starts/stops, and crash recovery. It is not yet
  a complete rule-aware period/penalty clock engine. UI must refresh samples.
- Announcement clock cues (final minute, period end) are still planner-only;
  journal-triggered cue scheduling is the next implementation step.
- Mercy policy change mid-game is intentionally blocked pending an audited
  configuration-change command.
- On restart the clock recovers at the last **committed** clock seconds. If
  several minutes ran since START, the recovered value is intentionally stale;
  the operator must reconcile with the officials before resuming.
- Code and xUnit tests were statically inspected only; .NET SDK was unavailable
  in the authoring container, and package restore could not be performed.

## Running the tests

```powershell
dotnet restore .\\tests\\Icebreaker.Core.Tests\\Icebreaker.Core.Tests.csproj
dotnet test .\\tests\\Icebreaker.Core.Tests\\Icebreaker.Core.Tests.csproj -c Release
```
