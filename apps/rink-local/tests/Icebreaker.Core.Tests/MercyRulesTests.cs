using Icebreaker.Core.Mercy;
using Xunit;

namespace Icebreaker.Core.Tests;

public sealed class MercyRulesTests
{
    private static readonly MercySettings Settings = new(Enabled: true, TriggerGoalDifferential: 5,
        MinimumPeriod: 2, RunningClock: true, CapPublicScoreDifferential: true,
        PublicScoreDifferentialCap: 5);

    [Fact]
    public void DoesNotActivateBeforeConfiguredPeriodOrThreshold()
    {
        Assert.False(MercyRules.Evaluate(Settings, new(), 1, 10, 1).IsActive);
        Assert.False(MercyRules.Evaluate(Settings, new(), 2, 6, 2).IsActive);
        Assert.True(MercyRules.Evaluate(Settings, new(), 2, 7, 2).IsActive);
    }

    [Fact]
    public void PublicScoreIsCappedButOfficialScoreIsNotChanged()
    {
        var officialHome = 9;
        var officialAway = 2;
        var decision = MercyRules.Evaluate(Settings, new(), 2, officialHome, officialAway);
        Assert.Equal(7, decision.PublicHomeScore);
        Assert.Equal(2, decision.PublicAwayScore);
        Assert.Equal(9, officialHome); // Official score is independent of the display projection.
        Assert.Equal(2, officialAway);
        var afterTrailingGoal = MercyRules.Evaluate(Settings, decision.State, 2, 10, 3);
        Assert.Equal(8, afterTrailingGoal.PublicHomeScore);
        Assert.Equal(3, afterTrailingGoal.PublicAwayScore);
    }

    [Fact]
    public void WorksWhenAwayTeamIsLeading()
    {
        var d = MercyRules.Evaluate(Settings, new(), 2, 1, 12);
        Assert.Equal(1, d.PublicHomeScore);
        Assert.Equal(6, d.PublicAwayScore);
    }

    [Fact]
    public void LatchedModeStaysActiveAfterLeadNarrows()
    {
        var first = MercyRules.Evaluate(Settings, new(), 2, 7, 2);
        var next = MercyRules.Evaluate(Settings, first.State, 2, 7, 4);
        Assert.True(next.IsActive);
        Assert.Equal(7, next.PublicHomeScore);
        Assert.Equal(4, next.PublicAwayScore);
    }

    [Fact]
    public void DynamicModeDeactivatesWhenLeadNarrows()
    {
        var dynamic = Settings with { Activation = MercyActivationMode.Dynamic };
        var first = MercyRules.Evaluate(dynamic, new(), 2, 7, 2);
        var next = MercyRules.Evaluate(dynamic, first.State, 2, 7, 4);
        Assert.False(next.IsActive);
    }

    [Fact]
    public void RunningClockIgnoresRoutineWhistlesButStopsForSafetyAndPeriodEnd()
    {
        var d = MercyRules.Evaluate(Settings, new(), 2, 7, 2);
        Assert.False(MercyRules.ShouldStopClock(d, ClockStopReason.OrdinaryWhistle));
        Assert.False(MercyRules.ShouldStopClock(d, ClockStopReason.Goal));
        Assert.True(MercyRules.ShouldStopClock(d, ClockStopReason.Injury));
        Assert.True(MercyRules.ShouldStopClock(d, ClockStopReason.PeriodEnd));
    }

    [Fact]
    public void DisabledSettingsNeverChangePublicScoreOrClock()
    {
        var d = MercyRules.Evaluate(Settings with { Enabled = false }, new(), 3, 20, 1);
        Assert.False(d.IsActive);
        Assert.Equal(20, d.PublicHomeScore);
        Assert.True(MercyRules.ShouldStopClock(d, ClockStopReason.Goal));
    }

    [Fact]
    public void RejectsInvalidConfiguration()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            MercyRules.Evaluate(Settings with { TriggerGoalDifferential = 0 }, new(), 2, 7, 2));
    }
}
