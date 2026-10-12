namespace Icebreaker.Core.Mercy;

/// <summary>Rules are league/tournament configuration, not hard-coded youth-hockey rules.</summary>
public sealed record MercySettings(
    bool Enabled = false,
    int TriggerGoalDifferential = 5,
    int MinimumPeriod = 3,
    bool RunningClock = true,
    bool CapPublicScoreDifferential = true,
    int PublicScoreDifferentialCap = 5,
    MercyActivationMode Activation = MercyActivationMode.LatchedForGame)
{
    public void Validate()
    {
        if (TriggerGoalDifferential < 1) throw new ArgumentOutOfRangeException(nameof(TriggerGoalDifferential));
        if (MinimumPeriod < 1) throw new ArgumentOutOfRangeException(nameof(MinimumPeriod));
        if (PublicScoreDifferentialCap < 1) throw new ArgumentOutOfRangeException(nameof(PublicScoreDifferentialCap));
    }
}

public enum MercyActivationMode
{
    /// <summary>Deactivates when the official score differential falls below the threshold.</summary>
    Dynamic,
    /// <summary>Once triggered, stays active for the remainder of the game.</summary>
    LatchedForGame
}

public enum ClockStopReason
{
    OrdinaryWhistle,
    Goal,
    Penalty,
    Injury,
    OfficialTimeout,
    PeriodEnd,
    GameEnd,
    OperatorSafetyStop
}

public sealed record MercyState(bool HasTriggered = false);

public sealed record MercyDecision(
    MercyState State,
    bool IsActive,
    bool RunningClockActive,
    bool PublicScoreCapActive,
    int PublicHomeScore,
    int PublicAwayScore);

/// <summary>
/// Pure rules evaluator. Official scores are inputs and are NEVER modified.
/// The caller must persist mercy activation transitions in the authoritative event journal.
/// </summary>
public static class MercyRules
{
    public static MercyDecision Evaluate(
        MercySettings settings, MercyState previous,
        int period, int officialHomeScore, int officialAwayScore)
    {
        settings.Validate();
        if (period < 1 || officialHomeScore < 0 || officialAwayScore < 0)
            throw new ArgumentOutOfRangeException(nameof(period), "Period and scores must be valid nonnegative values.");

        var thresholdReached = settings.Enabled && period >= settings.MinimumPeriod &&
            Math.Abs(officialHomeScore - officialAwayScore) >= settings.TriggerGoalDifferential;
        var hasTriggered = previous.HasTriggered || thresholdReached;
        var active = settings.Enabled && period >= settings.MinimumPeriod &&
            (thresholdReached || (settings.Activation == MercyActivationMode.LatchedForGame && hasTriggered));
        var home = officialHomeScore;
        var away = officialAwayScore;
        if (active && settings.CapPublicScoreDifferential)
        {
            if (home > away) home = Math.Min(home, away + settings.PublicScoreDifferentialCap);
            else if (away > home) away = Math.Min(away, home + settings.PublicScoreDifferentialCap);
        }
        return new MercyDecision(new MercyState(hasTriggered), active,
            active && settings.RunningClock, active && settings.CapPublicScoreDifferential,
            home, away);
    }

    /// <summary>
    /// Returns true if the clock should stop for this request. The final stop policy must be
    /// configured against the governing league's rules. Safety and period boundaries always stop.
    /// </summary>
    public static bool ShouldStopClock(MercyDecision decision, ClockStopReason reason) =>
        reason switch
        {
            ClockStopReason.Injury or ClockStopReason.OfficialTimeout or
            ClockStopReason.PeriodEnd or ClockStopReason.GameEnd or
            ClockStopReason.OperatorSafetyStop => true,
            ClockStopReason.OrdinaryWhistle or ClockStopReason.Goal or
            ClockStopReason.Penalty => !decision.RunningClockActive,
            _ => throw new ArgumentOutOfRangeException(nameof(reason))
        };
}
