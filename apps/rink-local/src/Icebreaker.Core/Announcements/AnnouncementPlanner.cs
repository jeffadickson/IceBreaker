using System.Globalization;

namespace Icebreaker.Core.Announcements;

public enum AnnouncementKind { Goal, Penalty, AttributionCorrection, FinalMinute, PeriodEnd, GameEnd }
public enum AnnouncementPriority { Routine = 0, Important = 1, Urgent = 2 }
public enum AnnouncementMode { Disabled, ManualApproval, Automatic }

public sealed record Announcement(
    string Id, string GameId, AnnouncementKind Kind, AnnouncementPriority Priority,
    string Script, long? SourceSequence, int Period, int ClockSeconds,
    bool RequiresApproval);

public sealed record AnnouncementSettings(
    AnnouncementMode GoalMode = AnnouncementMode.ManualApproval,
    AnnouncementMode PenaltyMode = AnnouncementMode.ManualApproval,
    AnnouncementMode CorrectionMode = AnnouncementMode.ManualApproval,
    AnnouncementMode ClockMode = AnnouncementMode.Automatic,
    bool IncludePlayerNames = false,
    bool EnableCorrections = true);

/// <summary>Resolves names from a trusted, locally cached roster. Youth names are off by default.</summary>
public interface IAnnouncementRoster
{
    string? PlayerNumber(string teamId, string playerId);
    string? PlayerPublicName(string teamId, string playerId);
    string TeamPublicName(string teamId);
}

/// <summary>Pure event-to-script projection. Invoke only for committed journal events.</summary>
public sealed class AnnouncementPlanner
{
    private readonly IAnnouncementRoster _roster;
    private readonly AnnouncementSettings _settings;

    public AnnouncementPlanner(IAnnouncementRoster roster, AnnouncementSettings? settings = null)
    {
        _roster = roster ?? throw new ArgumentNullException(nameof(roster));
        _settings = settings ?? new AnnouncementSettings();
    }

    public Announcement? ForEvent(GameEvent e)
    {
        ArgumentNullException.ThrowIfNull(e);
        switch (e.EventType)
        {
            case "GOAL_RECORDED":
            {
                var g = e.Payload<GoalData>();
                return Build(e, AnnouncementKind.Goal, AnnouncementPriority.Important, _settings.GoalMode,
                    $"Goal for {Team(g.TeamId)}! {GoalAttribution(g.TeamId, g.Scorer, g.Assist1, g.Assist2)}");
            }
            case "PENALTY_ASSESSED":
            {
                var p = e.Payload<PenaltyData>();
                var duration = p.DurationSeconds % 60 == 0
                    ? $"{p.DurationSeconds / 60} minute{(p.DurationSeconds == 60 ? "" : "s")}" 
                    : $"{p.DurationSeconds / 60} minutes and {p.DurationSeconds % 60} seconds";
                return Build(e, AnnouncementKind.Penalty, AnnouncementPriority.Important, _settings.PenaltyMode,
                    $"Penalty to {Team(p.TeamId)}, {Player(p.TeamId, p.Player)}. " +
                    $"{duration} for {Clean(p.Infraction)}.");
            }
            case "GOAL_ATTRIBUTION_CORRECTED" when _settings.EnableCorrections:
            {
                var c = e.Payload<CorrectionData>();
                // The correction payload has no TeamId; caller must supply the current goal's team.
                // Do not guess a team or issue a potentially false public announcement.
                return null;
            }
            default:
                return null;
        }
    }

    /// <summary>For a correction, supply the goal's authoritative team from the projected journal.</summary>
    public Announcement? ForCorrection(GameEvent e, string goalTeamId)
    {
        if (e.EventType != "GOAL_ATTRIBUTION_CORRECTED" || !_settings.EnableCorrections) return null;
        var c = e.Payload<CorrectionData>();
        return Build(e, AnnouncementKind.AttributionCorrection, AnnouncementPriority.Routine,
            _settings.CorrectionMode, $"Scoring correction for {Team(goalTeamId)}. " +
            GoalAttribution(goalTeamId, c.Scorer, c.Assist1, c.Assist2));
    }

    /// <summary>
    /// Called with authoritative displayed clock samples, never extrapolated time.
    /// Use the returned stable Id as a durable unique key to avoid repeats across restarts.
    /// Crossing 60 seconds due to a manual clock SET must not trigger this method.
    /// </summary>
    public Announcement? OnRunningClockCrossing(string gameId, int period,
        int previousSeconds, int currentSeconds, bool normalCountdown)
    {
        if (!normalCountdown || previousSeconds <= 60 || currentSeconds > 60 || currentSeconds < 0)
            return null;
        if (_settings.ClockMode == AnnouncementMode.Disabled) return null;
        return new Announcement($"{gameId}:period:{period}:final-minute", gameId,
            AnnouncementKind.FinalMinute, AnnouncementPriority.Important,
            $"One minute remaining in the {Ordinal(period)} period.", null, period,
            currentSeconds, _settings.ClockMode == AnnouncementMode.ManualApproval);
    }

    public Announcement? PeriodEnded(string gameId, int period)
    {
        if (_settings.ClockMode == AnnouncementMode.Disabled) return null;
        return new Announcement($"{gameId}:period:{period}:ended", gameId,
            AnnouncementKind.PeriodEnd, AnnouncementPriority.Routine,
            $"That concludes the {Ordinal(period)} period.", null, period, 0,
            _settings.ClockMode == AnnouncementMode.ManualApproval);
    }

    private Announcement? Build(GameEvent e, AnnouncementKind kind, AnnouncementPriority priority,
        AnnouncementMode mode, string script)
    {
        if (mode == AnnouncementMode.Disabled) return null;
        return new Announcement($"{e.GameId}:event:{e.EventId}:{kind}", e.GameId, kind,
            priority, script, e.Sequence, e.Period, e.ClockSeconds,
            mode == AnnouncementMode.ManualApproval);
    }

    private string GoalAttribution(string team, Attribution scorer, Attribution a1, Attribution a2)
    {
        if (scorer.Kind == AttributionKind.Tbd)
            return "Scorer to be announced.";
        string result = $"Scored by {Player(team, scorer)}.";
        var assists = new[] { a1, a2 }.Where(a => a.Kind == AttributionKind.Player)
            .Select(a => Player(team, a)).ToArray();
        if (assists.Length > 0) result += $" Assisted by {string.Join(" and ", assists)}.";
        if (a1.Kind == AttributionKind.Tbd || a2.Kind == AttributionKind.Tbd)
            result += " Additional assists to be announced.";
        return result;
    }

    private string Player(string team, Attribution attribution)
    {
        if (attribution.Kind == AttributionKind.Tbd) return "player to be announced";
        if (attribution.Kind == AttributionKind.None) return "team bench";
        var number = _roster.PlayerNumber(team, attribution.PlayerId!);
        if (string.IsNullOrWhiteSpace(number)) return "player to be announced";
        string baseText = $"number {Clean(number)}";
        var name = _settings.IncludePlayerNames ? _roster.PlayerPublicName(team, attribution.PlayerId!) : null;
        return string.IsNullOrWhiteSpace(name) ? baseText : $"{baseText}, {Clean(name)}";
    }

    private string Team(string id) => Clean(_roster.TeamPublicName(id));
    // Strip control characters and line breaks from any roster-sourced speech content.
    private static string Clean(string value) => new(value.Where(c => !char.IsControl(c)).Take(120).ToArray());
    private static string Ordinal(int n) => n switch
    {
        1 => "first", 2 => "second", 3 => "third", 4 => "fourth",
        _ => n.ToString(CultureInfo.InvariantCulture) + "th"
    };
}

/// <summary>Speech adapters: OS offline TTS, optional hosted AI TTS, or pre-rendered local audio.</summary>
public interface IAnnouncementSpeechProvider
{
    string ProviderId { get; }
    bool RequiresInternet { get; }
    Task<Stream> SynthesizeAsync(string script, CancellationToken cancellationToken);
}

/// <summary>Audio output isolated from the game clock and journal.</summary>
public interface IAnnouncementAudioOutput
{
    Task PlayAsync(Stream audio, CancellationToken cancellationToken);
}
