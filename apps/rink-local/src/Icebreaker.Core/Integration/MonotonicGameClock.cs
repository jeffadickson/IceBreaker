namespace Icebreaker.Core.Integration;

/// <summary>
/// Monotonic local countdown. Only START/STOP/SET actions are journaled by the caller;
/// ticks are derived display samples, never new official events. On restart, recover
/// the last committed time in PAUSED state; never silently extrapolate downtime.
/// </summary>
public sealed class MonotonicGameClock
{
    private readonly TimeProvider _time;
    private readonly object _gate = new();
    private long _anchorTimestamp;
    private TimeSpan _anchorRemaining;
    private bool _running;

    public MonotonicGameClock(TimeProvider? timeProvider = null)
    {
        _time = timeProvider ?? TimeProvider.System;
        _anchorTimestamp = _time.GetTimestamp();
    }

    public ClockSample Sample()
    {
        lock (_gate)
        {
            var elapsed = _running ? _time.GetElapsedTime(_anchorTimestamp, _time.GetTimestamp()) : TimeSpan.Zero;
            var remaining = _anchorRemaining - elapsed;
            if (remaining < TimeSpan.Zero) remaining = TimeSpan.Zero;
            return new ClockSample(remaining, _running && remaining > TimeSpan.Zero);
        }
    }

    public void RecoverPaused(int seconds)
    {
        if (seconds < 0) throw new ArgumentOutOfRangeException(nameof(seconds));
        lock (_gate)
        {
            _anchorRemaining = TimeSpan.FromSeconds(seconds);
            _anchorTimestamp = _time.GetTimestamp();
            _running = false;
        }
    }

    public void Start()
    {
        lock (_gate)
        {
            if (_running || _anchorRemaining <= TimeSpan.Zero) return;
            _anchorTimestamp = _time.GetTimestamp();
            _running = true;
        }
    }

    public ClockSample Stop()
    {
        lock (_gate)
        {
            var sample = Sample();
            _anchorRemaining = sample.Remaining;
            _anchorTimestamp = _time.GetTimestamp();
            _running = false;
            return sample with { IsRunning = false };
        }
    }

    public void Set(int seconds)
    {
        if (seconds < 0) throw new ArgumentOutOfRangeException(nameof(seconds));
        lock (_gate)
        {
            _anchorRemaining = TimeSpan.FromSeconds(seconds);
            _anchorTimestamp = _time.GetTimestamp();
        }
    }
}

public sealed record ClockSample(TimeSpan Remaining, bool IsRunning)
{
    // Whole-second ceiling avoids showing 0:00 before the remaining fraction expires.
    public int DisplaySeconds => (int)Math.Ceiling(Remaining.TotalSeconds);
}
