using Icebreaker.Core.Audit;
using Xunit;

namespace Icebreaker.Core.Tests;

public sealed class OperatorActionLogTests
{
    private static string TempPath() => Path.Combine(Path.GetTempPath(), "icebreaker-audit-tests",
        Guid.NewGuid().ToString("N"), "operator-actions.jsonl");

    [Fact]
    public void LogsDraftCancelConfirmAndReopensWithoutLosingSequence()
    {
        var path = TempPath();
        using (var log = new OperatorActionLog(path))
        {
            Assert.Equal(1, log.Record("session", "sk-1", "GOAL_DRAFT_OPENED", "game", "d1", null).Sequence);
            Assert.Equal(2, log.Record("session", "sk-1", "GOAL_DRAFT_CANCELED", "game", "d1", null).Sequence);
        }
        using (var log = new OperatorActionLog(path))
        {
            var entry = log.Record("session", "sk-1", "GOAL_CONFIRMED", "game", "d2", "event-1",
                new { team = "PAS", scorer = "TBD" });
            Assert.Equal(3, entry.Sequence);
            Assert.Equal(64, entry.Hash.Length);
        }
        Assert.Equal(3, File.ReadAllLines(path).Length);
    }

    [Fact]
    public void DetectsTamperingOnReopen()
    {
        var path = TempPath();
        using (var log = new OperatorActionLog(path))
            log.Record("s", "sk", "PENALTY_SELECTED", "g", "d", null);
        File.WriteAllText(path, File.ReadAllText(path).Replace("PENALTY_SELECTED", "GOAL_SELECTED"));
        Assert.Throws<InvalidDataException>(() => new OperatorActionLog(path));
    }

    [Fact]
    public void RejectsEmptyActionWithoutWriting()
    {
        var path = TempPath();
        using var log = new OperatorActionLog(path);
        Assert.Throws<ArgumentException>(() => log.Record("s", "sk", "", "g", null, null));
        Assert.Empty(File.ReadAllLines(path));
    }
}
