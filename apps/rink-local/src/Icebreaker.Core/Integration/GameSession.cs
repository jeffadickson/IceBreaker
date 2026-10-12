using Icebreaker.Core.Audit;
using Icebreaker.Core.Announcements;
using Icebreaker.Core.Mercy;

namespace Icebreaker.Core.Integration;

/// <summary>
/// Hockey-specific policy coordinator for one game. Callers must serialize all commands.
/// SQLite is authoritative; any missing derived transitions/announcements are reconciled
/// from the journal on construction. This is not a cross-process authority lease.
/// </summary>
public sealed class GameSession : IDisposable
{
    private readonly GameStore _store;
    private readonly AnnouncementOutbox _announcements;
    private readonly AnnouncementPlanner _planner;
    private readonly MonotonicGameClock _clock;
    private readonly MercySettings _settings;
    private readonly string _home;
    private readonly string _away;
    private readonly string _actor;
    private readonly object _gate = new();
    private readonly OperatorActionLog _operatorLog;
    private readonly string _auditSession = Guid.NewGuid().ToString("N");
    private readonly string _gameId;

    public GameSession(string databasePath, string gameId, string mirrorDirectory,
        string homeTeamId, string awayTeamId, MercySettings mercySettings,
        IAnnouncementRoster roster, AnnouncementSettings? announcementSettings = null,
        string systemActor = "icebreaker-policy", TimeProvider? timeProvider = null)
    {
        if (homeTeamId == awayTeamId || string.IsNullOrWhiteSpace(homeTeamId) || string.IsNullOrWhiteSpace(awayTeamId))
            throw new ArgumentException("Distinct home and away team IDs required.");
        mercySettings.Validate();
        _gameId = gameId;
        _operatorLog = new OperatorActionLog(Path.Combine(mirrorDirectory, "operator-actions.jsonl"));
        _settings = mercySettings;
        _home = homeTeamId;
        _away = awayTeamId;
        _actor = systemActor;
        _store = new GameStore(databasePath, gameId, mirrorDirectory);
        GamePolicyPin.VerifyOrCreate(databasePath, gameId, homeTeamId, awayTeamId, mercySettings);
        _announcements = new AnnouncementOutbox(databasePath, gameId);
        _planner = new AnnouncementPlanner(roster, announcementSettings);
        _clock = new MonotonicGameClock(timeProvider);
        var initial = _store.ReadView();
        _clock.RecoverPaused(initial.ClockSeconds);
        if (initial.ClockRunning)
        {
            // A process restart invalidates the in-memory monotonic anchor.
            // Record an explicit pause rather than assuming elapsed wall time.
            var recoveredStop = _store.UpdateClock($"clock:recovery:after:{initial.Sequence}", _actor,
                initial.Period, initial.ClockSeconds, "STOP");
            LogAction(_actor, "CLOCK_RECOVERY_PAUSED", new { recoveredStop.Event.EventId }, eventId: recoveredStop.Event.EventId);
        }
        // Never auto-play an old announcement following restart, even if the enqueue
        // happened just before a crash. Operators must review recovered items.
        _announcements.QuarantineUnsentOnStartup();
        LogAction(_actor, "PA_STARTUP_QUARANTINE_COMPLETED");
        ReconcileAnnouncements(recovered: true);
        ReconcileMercy("recovery");
        LogAction(_actor, "SESSION_OPENED", new { recoveredSequence = _store.ReadView().Sequence });
    }

    public GameView OfficialView { get { lock (_gate) return _store.ReadView(); } }
    public IReadOnlyList<GameEvent> Events { get { lock (_gate) return _store.ReadEvents(); } }
    public IReadOnlyList<QueuedAnnouncement> Announcements { get { lock (_gate) return _announcements.ReadAll(); } }

    public PublicGameView PublicView
    {
        get
        {
            lock (_gate)
            {
                var view = _store.ReadView();
                var decision = Decision(view);
                return new PublicGameView(view.Period, _clock.Sample().DisplaySeconds, _clock.Sample().IsRunning,
                    decision.PublicHomeScore, decision.PublicAwayScore, decision.IsActive,
                    decision.RunningClockActive);
            }
        }
    }

    public CommandResult RecordGoal(string key, string actor, int period, int seconds,
        string goalId, string teamId, Attribution scorer, Attribution assist1, Attribution assist2)
    {
        lock (_gate)
        {
            if (teamId != _home && teamId != _away) throw new ArgumentException("Unknown team.");
            return Audited(actor, "GOAL", key, () =>
            {
                var result = _store.RecordGoal(key, actor, period, seconds, goalId, teamId, scorer, assist1, assist2);
                StageEvent(result.Event);
                ReconcileMercy("goal recorded");
                return result;
            });
        }
    }

    public CommandResult CorrectAttribution(string key, string actor, int period, int seconds,
        string goalId, Attribution scorer, Attribution assist1, Attribution assist2, string reason)
    {
        lock (_gate)
        {
            return Audited(actor, "GOAL_ATTRIBUTION_CORRECTION", key, () =>
            {
                var result = _store.CorrectAttribution(key, actor, period, seconds,
                    goalId, scorer, assist1, assist2, reason);
                StageEvent(result.Event);
                return result;
            });
        }
    }

    public CommandResult AssessPenalty(string key, string actor, int period, int seconds,
        string penaltyId, string teamId, Attribution player, string infraction, int durationSeconds)
    {
        lock (_gate)
        {
            if (teamId != _home && teamId != _away) throw new ArgumentException("Unknown team.");
            return Audited(actor, "PENALTY", key, () =>
            {
                var result = _store.AssessPenalty(key, actor, period, seconds,
                    penaltyId, teamId, player, infraction, durationSeconds);
                StageEvent(result.Event);
                return result;
            });
        }
    }

    public CommandResult UpdateClock(string key, string actor, int period, int seconds, string action)
    {
        lock (_gate)
        {
            return Audited(actor, "CLOCK_" + action, key, () =>
            {
                var sampled = _clock.Sample();
                int journalSeconds = action == "STOP" && sampled.IsRunning ? sampled.DisplaySeconds : seconds;
                var result = _store.UpdateClock(key, actor, period, journalSeconds, action);
                if (!result.WasDuplicate)
                {
                    if (action == "START") { _clock.Set(seconds); _clock.Start(); }
                    else if (action == "STOP") _clock.Stop();
                    else if (action == "SET") _clock.Set(seconds);
                }
                ReconcileMercy("period/clock update");
                return result;
            });
        }
    }

    /// <summary>Whistle stop request: policy may keep the clock running, but the request is logged.</summary>
    public StopResult RequestStop(string key, string actor, ClockStopReason reason)
    {
        lock (_gate)
        {
            var stop = false;
            var result = Audited(actor, "CLOCK_STOP_REQUEST_" + reason, key, () =>
            {
                var view = _store.ReadView();
                stop = MercyRules.ShouldStopClock(Decision(view), reason);
                var sample = _clock.Sample();
                var command = stop
                    ? _store.UpdateClock(key, actor, view.Period, sample.DisplaySeconds, "STOP")
                    : _store.RecordIgnoredStop(key, actor, view.Period, sample.DisplaySeconds, reason.ToString());
                if (stop && !command.WasDuplicate) _clock.Stop();
                return command;
            });
            return new StopResult(stop, result);
        }
    }

    public void ApproveAnnouncement(string id) { lock (_gate) { LogAction(_actor, "PA_APPROVE_REQUESTED", new { id }); _announcements.Approve(id); LogAction(_actor, "PA_APPROVED", new { id }); } }
    public bool ClaimAnnouncement(string id) { lock (_gate) { LogAction(_actor, "PA_CLAIM_REQUESTED", new { id }); var result = _announcements.Claim(id); LogAction(_actor, "PA_CLAIM_RESULT", new { id, result }); return result; } }
    public void CompleteAnnouncement(string id) { lock (_gate) { LogAction(_actor, "PA_COMPLETE_REQUESTED", new { id }); _announcements.Complete(id); LogAction(_actor, "PA_COMPLETED", new { id }); } }
    public void SkipAnnouncement(string id) { lock (_gate) { LogAction(_actor, "PA_SKIP_REQUESTED", new { id }); _announcements.Skip(id); LogAction(_actor, "PA_SKIPPED", new { id }); } }

    /// <summary>UI must call this for draft selection, editing, cancellation, confirmation dialog, etc.</summary>
    public void RecordOperatorAction(string actor, string action, string? draftId = null, object? details = null)
    {
        lock (_gate) LogAction(actor, action, details, draftId);
    }

    private void LogAction(string actor, string action, object? details = null, string? draftId = null,
        string? eventId = null)
    {
        _operatorLog.Record(_auditSession, actor, action, _gameId, draftId, eventId, details);
    }

    private CommandResult Audited(string actor, string kind, string key, Func<CommandResult> operation)
    {
        // Write attempt before touching official state; if audit storage fails, do not execute.
        LogAction(actor, kind + "_REQUESTED", new { idempotencyKey = key });
        try
        {
            var result = operation();
            LogAction(actor, kind + (result.WasDuplicate ? "_DUPLICATE" : "_ACCEPTED"),
                new { idempotencyKey = key, result.Event.EventType }, eventId: result.Event.EventId);
            return result;
        }
        catch (Exception ex)
        {
            // A post-commit audit write failure must not cause the UI to blindly retry
            // with a different key; caller must reconcile with official event journal.
            try { LogAction(actor, kind + "_FAILED", new { idempotencyKey = key, errorType = ex.GetType().Name }); }
            catch (IOException) { /* preserve the original exception */ }
            throw;
        }
    }

    private MercyDecision Decision(GameView view) => MercyRules.Evaluate(_settings,
        new MercyState(view.MercyTriggered), view.Period,
        view.Scores.GetValueOrDefault(_home), view.Scores.GetValueOrDefault(_away));

    private void ReconcileMercy(string reason)
    {
        var view = _store.ReadView();
        var d = Decision(view);
        if (view.MercyActive == d.IsActive && view.MercyTriggered == d.State.HasTriggered) return;
        // Stable reconciliation key for a given authoritative state, including period.
        var transition = _store.RecordMercyTransition($"mercy:after:{view.Sequence}", _actor,
            view.Period, view.ClockSeconds, d.IsActive, d.State.HasTriggered, reason);
        LogAction(_actor, "MERCY_MODE_EVALUATED", new { d.IsActive, d.State.HasTriggered, reason },
            eventId: transition.Event.EventId);
    }

    private void ReconcileAnnouncements(bool recovered)
    {
        foreach (var e in _store.ReadEvents()) StageEvent(e, recovered);
    }

    private void StageEvent(GameEvent e, bool recovered = false)
    {
        Announcement? item;
        if (e.EventType == "GOAL_ATTRIBUTION_CORRECTED")
        {
            var correction = e.Payload<CorrectionData>();
            var goal = _store.ReadView().Goals.GetValueOrDefault(correction.GoalId);
            item = goal is null ? null : _planner.ForCorrection(e, goal.TeamId);
        }
        else item = _planner.ForEvent(e);
        if (item is not null)
        {
            LogAction(_actor, "PA_STAGE_REQUESTED", new { item.Id, recovered }, eventId: e.EventId);
            _announcements.Stage(item, recovered);
        }
    }

    public void Dispose() { _announcements.Dispose(); _store.Dispose(); _operatorLog.Dispose(); }
}

public sealed record PublicGameView(int Period, int SecondsRemaining, bool ClockRunning,
    int HomeScore, int AwayScore, bool MercyActive, bool RunningClockPolicyActive);
public sealed record StopResult(bool Stopped, CommandResult Command);
