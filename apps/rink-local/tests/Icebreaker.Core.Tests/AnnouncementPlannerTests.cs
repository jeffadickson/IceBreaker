using Icebreaker.Core;
using Icebreaker.Core.Announcements;
using System.Text.Json;
using Xunit;

namespace Icebreaker.Core.Tests;

public sealed class AnnouncementPlannerTests
{
    private sealed class Roster : IAnnouncementRoster
    {
        public string TeamPublicName(string teamId) => teamId == "H" ? "Home Hawks" : "Visitors";
        public string? PlayerNumber(string teamId, string playerId) => playerId;
        public string? PlayerPublicName(string teamId, string playerId) => "Private Child Name";
    }

    private static GameEvent Event(string type, object payload) => new(1, "e1", "game1", "req1", type,
        DateTimeOffset.UtcNow, "operator", 2, 432, JsonSerializer.Serialize(payload, JsonOptions.Default));

    [Fact]
    public void TbdGoalDoesNotInventPlayerOrAnnouncePrivateName()
    {
        var planner = new AnnouncementPlanner(new Roster());
        var goal = Event("GOAL_RECORDED", new GoalData("g1", "H", Attribution.Tbd,
            Attribution.Tbd, Attribution.None));
        var announcement = planner.ForEvent(goal)!;
        Assert.Contains("Scorer to be announced", announcement.Script);
        Assert.DoesNotContain("Private Child Name", announcement.Script);
        Assert.True(announcement.RequiresApproval);
    }

    [Fact]
    public void KnownGoalUsesNumberByDefault()
    {
        var planner = new AnnouncementPlanner(new Roster());
        var goal = Event("GOAL_RECORDED", new GoalData("g1", "H", Attribution.Player("17"),
            Attribution.Player("8"), Attribution.None));
        var announcement = planner.ForEvent(goal)!;
        Assert.Contains("number 17", announcement.Script);
        Assert.Contains("number 8", announcement.Script);
        Assert.DoesNotContain("Private Child Name", announcement.Script);
    }

    [Fact]
    public void FinalMinuteOnlyOnRealCountdownCrossingAndUsesStableId()
    {
        var planner = new AnnouncementPlanner(new Roster());
        Assert.Null(planner.OnRunningClockCrossing("g", 2, 61, 59, false));
        Assert.Null(planner.OnRunningClockCrossing("g", 2, 60, 59, true));
        var first = planner.OnRunningClockCrossing("g", 2, 61, 59, true)!;
        var retry = planner.OnRunningClockCrossing("g", 2, 65, 58, true)!;
        Assert.Equal(first.Id, retry.Id);
        Assert.Contains("second period", first.Script);
    }

    [Fact]
    public void CorrectionRequiresAuthoritativeGoalTeam()
    {
        var planner = new AnnouncementPlanner(new Roster());
        var correction = Event("GOAL_ATTRIBUTION_CORRECTED", new CorrectionData("g1",
            Attribution.Player("17"), Attribution.Player("8"), Attribution.None, "referee"));
        Assert.Null(planner.ForEvent(correction));
        var announcement = planner.ForCorrection(correction, "H")!;
        Assert.Contains("Home Hawks", announcement.Script);
        Assert.Contains("number 17", announcement.Script);
    }

    [Fact]
    public void DisabledGoalAnnouncementsAreNotPlanned()
    {
        var planner = new AnnouncementPlanner(new Roster(), new AnnouncementSettings(
            GoalMode: AnnouncementMode.Disabled));
        Assert.Null(planner.ForEvent(Event("GOAL_RECORDED", new GoalData("g1", "H",
            Attribution.Tbd, Attribution.None, Attribution.None))));
    }
}
