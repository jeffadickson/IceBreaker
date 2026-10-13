using Icebreaker.Core.Integration;
using Icebreaker.Timekeeper.Desktop;
using Xunit;

namespace Icebreaker.Core.Tests;

public sealed class DesktopAnnouncementTests
{
    [Fact]
    public void GoalAndPenaltyScriptsUseJerseyNumbersNotPrivateNames()
    {
        var goal = AnnouncementQueue.ScriptFor(new RinkEvent("g1", "GOAL_RECORDED", "home",
            """{"scorer":"29","assist1":"17","assist2":"None"}"""));
        Assert.NotNull(goal);
        Assert.Contains("number 29", goal);
        Assert.Contains("number 17", goal);
        Assert.DoesNotContain("Private", goal);
        var penalty = AnnouncementQueue.ScriptFor(new RinkEvent("p1", "PENALTY_ASSESSED", "away",
            """{"player":"22","infraction":"Tripping","duration":120}"""));
        Assert.Contains("number 22", penalty);
        Assert.Contains("2 minutes", penalty);
        Assert.Contains("Tripping", penalty);
        Assert.Null(AnnouncementQueue.ScriptFor(new RinkEvent("x", "SHOT_RECORDED", "home", "{}")));
    }

    [Fact]
    public void QueueIsIdempotentAndCrashRecoveryNeedsManualReview()
    {
        var file = Path.Combine(Path.GetTempPath(), "icebreaker-pa-" + Guid.NewGuid().ToString("N") + ".db");
        try
        {
            var ev = new RinkEvent("goal-1", "GOAL_RECORDED", "home",
                """{"scorer":"29","assist1":"None","assist2":"None"}""");
            using (var queue = new AnnouncementQueue(file))
            {
                queue.Stage(ev);
                queue.Stage(ev);
                Assert.Single(queue.Read());
                queue.Mark("goal-1", "PLAYING", "PENDING");
            }
            using (var recovered = new AnnouncementQueue(file))
            {
                Assert.Single(recovered.Read());
                Assert.Equal("NEEDS_REVIEW", recovered.Read()[0].State);
                recovered.Mark("goal-1", "SKIPPED", "NEEDS_REVIEW");
                Assert.Empty(recovered.Read());
            }
        }
        finally { if (File.Exists(file)) File.Delete(file); }
    }

    [Fact]
    public async Task InvalidSpeechInputsAreRejectedBeforeProviderContact()
    {
        using var http = new HttpClient();
        var speech = new AnnouncementSpeech(http);
        await Assert.ThrowsAsync<ArgumentException>(() => speech.SynthesizeAsync("", true));
        await Assert.ThrowsAsync<ArgumentException>(() => speech.SynthesizeAsync("hi\nthere", true));
        await Assert.ThrowsAsync<ArgumentException>(() => speech.SynthesizeAsync("hello", true, "unsupported-voice"));
    }
}
