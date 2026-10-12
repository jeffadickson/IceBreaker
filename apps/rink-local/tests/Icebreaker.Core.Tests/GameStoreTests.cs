using System.Text.Json;
using Icebreaker.Core;
using Xunit;

namespace Icebreaker.Core.Tests;

public sealed class GameStoreTests
{
    private static (string Db, string Mirror) Paths()
    {
        string dir = Path.Combine(Path.GetTempPath(), "icebreaker-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return (Path.Combine(dir, "game.db"), Path.Combine(dir, "mirror"));
    }

    [Fact]
    public void TbdGoalCorrectionDoesNotChangeScoreAndPreservesOriginalEvent()
    {
        var (db, mirror) = Paths();
        using var store = new GameStore(db, "game-1", mirror);
        store.RecordGoal("request-1", "operator-1", 2, 763, "goal-1", "HOME",
            Attribution.Tbd, Attribution.Tbd, Attribution.None);
        Assert.Equal(1, store.ReadView().Scores["HOME"]);
        Assert.Single(store.ReadView().Unresolved);
        store.CorrectAttribution("request-2", "operator-1", 2, 763, "goal-1",
            Attribution.Player("17"), Attribution.Player("8"), Attribution.None, "confirmed by referee");
        var view = store.ReadView();
        Assert.Equal(1, view.Scores["HOME"]);
        Assert.Empty(view.Unresolved);
        Assert.Equal(2, view.Sequence);
        Assert.Equal(2, store.PendingOutboxCount());
        Assert.Contains("GOAL_RECORDED", File.ReadAllText(Path.Combine(mirror, "game-events.log")));
        Assert.Contains("GOAL_ATTRIBUTION_CORRECTED", File.ReadAllText(Path.Combine(mirror, "game-events.log")));
    }

    [Fact]
    public void IdempotentRetryCannotDoubleScore()
    {
        var (db, mirror) = Paths();
        using var store = new GameStore(db, "game-1", mirror);
        var a = store.RecordGoal("same-request", "operator", 1, 500, "g1", "AWAY",
            Attribution.Tbd, Attribution.None, Attribution.None);
        var b = store.RecordGoal("same-request", "operator", 1, 500, "g1", "AWAY",
            Attribution.Tbd, Attribution.None, Attribution.None);
        Assert.False(a.WasDuplicate);
        Assert.True(b.WasDuplicate);
        Assert.Equal(a.Event.EventId, b.Event.EventId);
        Assert.Equal(1, store.ReadView().Scores["AWAY"]);
        Assert.Single(store.ReadEvents());
    }

    [Fact]
    public void RestartRepairsMissingMirrorsFromJournal()
    {
        var (db, mirror) = Paths();
        using (var store = new GameStore(db, "game-1", mirror))
        {
            store.RecordGoal("req-1", "operator", 1, 500, "g1", "HOME",
                Attribution.Tbd, Attribution.None, Attribution.None);
        }
        File.Delete(Path.Combine(mirror, "game-events.log"));
        File.Delete(Path.Combine(mirror, "game-events.jsonl"));
        using (var reopened = new GameStore(db, "game-1", mirror))
        {
            Assert.True(reopened.TextMirrorHealthy);
            Assert.Equal(1, reopened.ReadView().Scores["HOME"]);
        }
        var lines = File.ReadAllLines(Path.Combine(mirror, "game-events.jsonl"));
        Assert.Single(lines);
        using var parsed = JsonDocument.Parse(lines[0]);
        Assert.Equal("GOAL_RECORDED", parsed.RootElement.GetProperty("eventType").GetString());
    }

    [Fact]
    public void InvalidAttributionIsRejectedWithoutJournalEntry()
    {
        var (db, mirror) = Paths();
        using var store = new GameStore(db, "game-1", mirror);
        Assert.Throws<ArgumentException>(() => store.RecordGoal("req-1", "operator", 1, 500,
            "g1", "HOME", Attribution.None, Attribution.None, Attribution.None));
        Assert.Throws<ArgumentException>(() => store.RecordGoal("req-2", "operator", 1, 500,
            "g1", "HOME", Attribution.Player("17"), Attribution.Player("17"), Attribution.None));
        Assert.Empty(store.ReadEvents());
    }

    [Fact]
    public void PenaltiesAndClockActionsAppearInMirror()
    {
        var (db, mirror) = Paths();
        using var store = new GameStore(db, "game-1", mirror);
        store.UpdateClock("clock-1", "operator", 1, 1200, "START");
        store.UpdateClock("clock-2", "operator", 1, 1100, "STOP");
        store.AssessPenalty("penalty-1", "operator", 1, 1100, "p1", "AWAY",
            Attribution.Tbd, "TRIPPING", 120);
        var view = store.ReadView();
        Assert.False(view.ClockRunning);
        Assert.Equal(1100, view.ClockSeconds);
        Assert.Single(view.Penalties);
        Assert.Equal(3, File.ReadAllLines(Path.Combine(mirror, "game-events.log")).Length);
    }
}
