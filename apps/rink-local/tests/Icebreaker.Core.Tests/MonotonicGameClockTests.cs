using Icebreaker.Core.Integration;
using Xunit;

namespace Icebreaker.Core.Tests;

public sealed class MonotonicGameClockTests
{
    private sealed class FakeTime : TimeProvider
    {
        public long Ticks;
        public override long TimestampFrequency => 10_000_000;
        public override long GetTimestamp() => Ticks;
        public void AdvanceSeconds(int seconds) => Ticks += seconds * TimestampFrequency;
    }

    [Fact]
    public void CountdownUsesMonotonicTimeAndFreezesWhenStopped()
    {
        var time = new FakeTime();
        var clock = new MonotonicGameClock(time);
        clock.RecoverPaused(120);
        clock.Start();
        time.AdvanceSeconds(17);
        Assert.Equal(103, clock.Sample().DisplaySeconds);
        clock.Stop();
        time.AdvanceSeconds(40);
        Assert.Equal(103, clock.Sample().DisplaySeconds);
        Assert.False(clock.Sample().IsRunning);
    }

    [Fact]
    public void RecoveryAlwaysStartsPausedAndNeverSubtractsDowntime()
    {
        var time = new FakeTime();
        var clock = new MonotonicGameClock(time);
        clock.RecoverPaused(55);
        time.AdvanceSeconds(500);
        Assert.Equal(55, clock.Sample().DisplaySeconds);
        Assert.False(clock.Sample().IsRunning);
    }

    [Fact]
    public void CountdownNeverBecomesNegative()
    {
        var time = new FakeTime();
        var clock = new MonotonicGameClock(time);
        clock.Set(5);
        clock.Start();
        time.AdvanceSeconds(10);
        Assert.Equal(0, clock.Sample().DisplaySeconds);
        Assert.False(clock.Sample().IsRunning);
    }
}
