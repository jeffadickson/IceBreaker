using Icebreaker.Core;
using Icebreaker.Core.Announcements;
using Icebreaker.Core.Integration;
using Icebreaker.Core.Mercy;
using Xunit;

namespace Icebreaker.Core.Tests;

public sealed class GameSessionTests
{
    private sealed class Roster : IAnnouncementRoster
    {
        public string? PlayerNumber(string teamId, string playerId) => playerId;
        public string? PlayerPublicName(string teamId, string playerId) => null;
        public string TeamPublicName(string teamId) => teamId;
    }

    private static (string Db, string Mirror) Paths()
    {
        var dir = Path.Combine(Path.GetTempPath(), "icebreaker-v04-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return (Path.Combine(dir, "game.db"), Path.Combine(dir, "mirror"));
    }

    private static GameSession Open(string db, string mirror) => new(db, "g", mirror,
        "HOME", "AWAY", new MercySettings(Enabled: true, TriggerGoalDifferential: 2,
            MinimumPeriod: 2, RunningClock: true, CapPublicScoreDifferential: true,
            PublicScoreDifferentialCap: 2), new Roster(),
        new AnnouncementSettings(GoalMode: AnnouncementMode.Automatic,
            PenaltyMode: AnnouncementMode.ManualApproval));

    [Fact]
    public void MercyTransitionIsJournaledAndPublicScoreIsCapped()
    {
        var (db, mirror) = Paths();
        using var game = Open(db, mirror);
        game.RecordGoal("g1", "op", 2, 700, "goal1", "HOME", Attribution.Tbd, Attribution.None, Attribution.None);
        Assert.False(game.PublicView.MercyActive);
        game.RecordGoal("g2", "op", 2, 690, "goal2", "HOME", Attribution.Tbd, Attribution.None, Attribution.None);
        Assert.True(game.PublicView.MercyActive);
        Assert.Contains(game.Events, e => e.EventType == "MERCY_MODE_CHANGED");
        game.RecordGoal("g3", "op", 2, 650, "goal3", "HOME", Attribution.Tbd, Attribution.None, Attribution.None);
        Assert.Equal(3, game.OfficialView.Scores["HOME"]);
        Assert.Equal(2, game.PublicView.HomeScore);
        Assert.Equal(3, game.Announcements.Count);
    }

    [Fact]
    public void RoutineStopIgnoredButSafetyStopAcceptedAndAudited()
    {
        var (db, mirror) = Paths();
        using var game = Open(db, mirror);
        game.RecordGoal("g1", "op", 2, 700, "goal1", "HOME", Attribution.Tbd, Attribution.None, Attribution.None);
        game.RecordGoal("g2", "op", 2, 690, "goal2", "HOME", Attribution.Tbd, Attribution.None, Attribution.None);
        game.UpdateClock("start", "op", 2, 690, "START");
        Assert.False(game.RequestStop("whistle", "op", ClockStopReason.OrdinaryWhistle).Stopped);
        Assert.True(game.OfficialView.ClockRunning);
        Assert.Contains(game.Events, e => e.EventType == "CLOCK_STOP_IGNORED");
        Assert.True(game.RequestStop("injury", "op", ClockStopReason.Injury).Stopped);
        Assert.False(game.OfficialView.ClockRunning);
    }

    [Fact]
    public void RestartRetainsMercyAndDoesNotReplayClaimedAnnouncement()
    {
        var (db, mirror) = Paths();
        string announcementId;
        using (var game = Open(db, mirror))
        {
            game.RecordGoal("g1", "op", 2, 700, "goal1", "HOME", Attribution.Tbd, Attribution.None, Attribution.None);
            game.RecordGoal("g2", "op", 2, 690, "goal2", "HOME", Attribution.Tbd, Attribution.None, Attribution.None);
            announcementId = game.Announcements[0].Id;
            Assert.True(game.ClaimAnnouncement(announcementId));
        }
        using var reopened = Open(db, mirror);
        Assert.True(reopened.PublicView.MercyActive);
        Assert.Equal(2, reopened.Announcements.Count);
        Assert.Equal(AnnouncementDeliveryState.NeedsReview,
            reopened.Announcements.Single(a => a.Id == announcementId).State);
        Assert.False(reopened.ClaimAnnouncement(announcementId));
        reopened.ApproveAnnouncement(announcementId);
        Assert.True(reopened.ClaimAnnouncement(announcementId));
        reopened.CompleteAnnouncement(announcementId);
        Assert.Equal(AnnouncementDeliveryState.Completed,
            reopened.Announcements.Single(a => a.Id == announcementId).State);
    }

    [Fact]
    public void AttributionCorrectionPreservesScoreAndStagesSeparateReviewAnnouncement()
    {
        var (db, mirror) = Paths();
        using var game = Open(db, mirror);
        game.RecordGoal("g1", "op", 2, 700, "goal1", "HOME", Attribution.Tbd, Attribution.None, Attribution.None);
        game.CorrectAttribution("correction", "ref", 2, 690, "goal1",
            Attribution.Player("17"), Attribution.None, Attribution.None, "verified");
        Assert.Equal(1, game.OfficialView.Scores["HOME"]);
        Assert.Empty(game.OfficialView.Unresolved);
        Assert.Equal(2, game.Announcements.Count);
        Assert.Contains(game.Announcements, a => a.Kind == AnnouncementKind.AttributionCorrection);
    }

    [Fact]
    public void RetryDoesNotDuplicateGoalOrAnnouncements()
    {
        var (db, mirror) = Paths();
        using var game = Open(db, mirror);
        var a = game.RecordGoal("same", "op", 2, 700, "goal1", "HOME", Attribution.Tbd, Attribution.None, Attribution.None);
        var b = game.RecordGoal("same", "op", 2, 700, "goal1", "HOME", Attribution.Tbd, Attribution.None, Attribution.None);
        Assert.False(a.WasDuplicate);
        Assert.True(b.WasDuplicate);
        Assert.Single(game.Announcements);
    }
    [Fact]
    public void PolicyCannotSilentlyChangeAfterRestart()
    {
        var (db, mirror) = Paths();
        using (var game = Open(db, mirror))
            game.RecordGoal("g1", "op", 1, 700, "goal1", "HOME",
                Attribution.Tbd, Attribution.None, Attribution.None);
        Assert.Throws<InvalidOperationException>(() => new GameSession(db, "g", mirror,
            "HOME", "AWAY", new MercySettings(Enabled: true, TriggerGoalDifferential: 8),
            new Roster()));
    }

    [Fact]
    public void RestartRecordsPauseWhenPriorClockWasRunning()
    {
        var (db, mirror) = Paths();
        using (var game = Open(db, mirror))
            game.UpdateClock("start", "op", 1, 600, "START");
        using var restarted = Open(db, mirror);
        Assert.False(restarted.PublicView.ClockRunning);
        Assert.False(restarted.OfficialView.ClockRunning);
        Assert.Equal(600, restarted.PublicView.SecondsRemaining);
        Assert.Equal(2, restarted.Events.Count);
        Assert.Equal("CLOCK_UPDATED", restarted.Events[1].EventType);
    }

    [Fact]
    public void OperatorAuditIncludesDraftCancellationGoalPenaltyAndClockRequests()
    {
        var (db, mirror) = Paths();
        using (var game = Open(db, mirror))
        {
            game.RecordOperatorAction("op", "GOAL_DRAFT_OPENED", "draft-1", new { team = "HOME" });
            game.RecordOperatorAction("op", "GOAL_DRAFT_CANCELED", "draft-1");
            game.RecordGoal("goal-key", "op", 2, 700, "goal-1", "HOME",
                Attribution.Tbd, Attribution.None, Attribution.None);
            game.AssessPenalty("penalty-key", "op", 2, 700, "penalty-1", "AWAY",
                Attribution.Player("22"), "Tripping", 120);
            game.UpdateClock("clock-key", "op", 2, 700, "START");
        }
        var log = File.ReadAllText(Path.Combine(mirror, "operator-actions.jsonl"));
        Assert.Contains("GOAL_DRAFT_CANCELED", log);
        Assert.Contains("GOAL_ACCEPTED", log);
        Assert.Contains("PENALTY_ACCEPTED", log);
        Assert.Contains("CLOCK_START_ACCEPTED", log);
        Assert.Contains("PA_STAGE_REQUESTED", log);
    }

}
