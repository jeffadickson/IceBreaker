using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Icebreaker.Core.Integration;

/// <summary>
/// HTTP client for the independently running local rink authority.
/// It never advances a clock locally. Every displayed second comes from the
/// authoritative snapshot; no cached snapshot is used to authorize a command.
/// </summary>
public sealed class RinkClockClient(HttpClient http, string operatorKey, string operatorId = "desktop-timekeeper")
{
    public static readonly ActivitySource Telemetry = new("IceBreaker.Desktop", "1.0.0");
    private static readonly HashSet<string> SafeEvents = new(StringComparer.Ordinal) { "GOAL_RECORDED", "GOAL_ATTRIBUTION_CORRECTED", "PENALTY_ASSESSED", "GOALIE_CHANGED", "CLOCK_UPDATED", "CLOCK_SYNCED", "PERIOD_ENDED", "PERIOD_ADVANCED", "OVERTIME_STARTED", "TIMEOUT_TAKEN" };

    public async Task<RinkClockSnapshot> SnapshotAsync(CancellationToken token = default)
    {
        using var span = Telemetry.StartActivity("icebreaker.rink.snapshot", ActivityKind.Client);
        using var response = await http.GetAsync("/api/games/demo/snapshot", token);
        response.EnsureSuccessStatusCode();
        using var json = await response.Content.ReadFromJsonAsync<JsonDocument>(cancellationToken: token)
            ?? throw new InvalidOperationException("Empty rink snapshot");
        var root = json.RootElement;
        var score = root.GetProperty("scores");
        return new RinkClockSnapshot(
            root.GetProperty("revision").GetInt32(),
            root.GetProperty("period").GetInt32(),
            root.GetProperty("seconds").GetInt32(),
            root.GetProperty("running").GetBoolean(),
            root.GetProperty("ended").GetBoolean(),
            score.GetProperty("home").GetInt32(),
            score.GetProperty("away").GetInt32(),
            root.TryGetProperty("clockMode", out var mode) ? mode.GetString() ?? "STOP" : "STOP",
            root.TryGetProperty("timingVersion", out var version) ? version.GetString() ?? "DEFAULT" : "DEFAULT",
            root.TryGetProperty("penalties", out var penalties) ? penalties.GetRawText() : "{}",
            root.TryGetProperty("events", out var events) && events.ValueKind == JsonValueKind.Array
                ? events.EnumerateArray().Select(e => new RinkEvent(
                    e.GetProperty("id").GetString() ?? "", e.GetProperty("type").GetString() ?? "",
                    e.TryGetProperty("team", out var t) ? t.GetString() : null,
                    e.TryGetProperty("details", out var d) ? d.GetRawText() : "{}")).ToArray()
                : []);
    }

    public async Task CommandAsync(object command, CancellationToken token = default)
    {
        using var span = Telemetry.StartActivity("icebreaker.rink.command", ActivityKind.Client);
        var eventType = command.GetType().GetProperty("type")?.GetValue(command)?.ToString();
        span?.SetTag("icebreaker.game.event_type", eventType is not null && SafeEvents.Contains(eventType) ? eventType : "OTHER");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/operator/command")
        {
            Content = JsonContent.Create(command)
        };
        if (Activity.Current?.Id is { } traceparent) request.Headers.TryAddWithoutValidation("traceparent", traceparent);
        request.Headers.Add("X-Operator-Key", operatorKey);
        request.Headers.Add("X-Operator-Id", operatorId);
        request.Headers.Add("Idempotency-Key", "desktop-" + Guid.NewGuid().ToString("N"));
        using var response = await http.SendAsync(request, token);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(token);
            throw new InvalidOperationException($"Rink authority rejected command ({(int)response.StatusCode}): {body}");
        }
    }

    public async Task ToggleAsync(CancellationToken token = default)
    {
        var state = await SnapshotAsync(token);
        if (state.Ended) throw new InvalidOperationException("Game is final");
        await CommandAsync(new { type = "CLOCK_UPDATED", action = state.Running ? "STOP" : "START", seconds = state.Seconds }, token);
    }

    public async Task NudgeAsync(int delta, CancellationToken token = default)
    {
        if (delta != -1 && delta != 1) throw new ArgumentOutOfRangeException(nameof(delta));
        var state = await SnapshotAsync(token);
        if (state.Running || state.Ended) throw new InvalidOperationException("Stop the clock before adjusting");
        // The authority checks the division-specific period bounds atomically.
        await CommandAsync(new { type = "CLOCK_SYNCED", seconds = checked(state.Seconds + delta), scope = "GAME_AND_PENALTIES", reason = $"Desktop operator {delta:+#;-#} second correction" }, token);
    }

    public async Task SetClockAsync(string mmss, string reason, CancellationToken token = default)
    {
        if (!Regex.IsMatch(mmss, @"^\d{1,2}:[0-5]\d$")) throw new ArgumentException("Use MM:SS", nameof(mmss));
        if (string.IsNullOrWhiteSpace(reason)) throw new ArgumentException("Clock correction reason required", nameof(reason));
        var state = await SnapshotAsync(token);
        if (state.Running || state.Ended) throw new InvalidOperationException("Stop the clock before adjusting");
        var parts = mmss.Split(':');
        var seconds = checked(int.Parse(parts[0]) * 60 + int.Parse(parts[1]));
        await CommandAsync(new { type = "CLOCK_SYNCED", seconds, scope = "GAME_ONLY", reason = reason.Trim() }, token);
    }

    public async Task AuxiliaryAsync(string action, string? phase = null, CancellationToken token = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/operator/aux-clock")
        {
            Content = JsonContent.Create(new { action, phase })
        };
        request.Headers.Add("X-Operator-Key", operatorKey);
        request.Headers.Add("X-Operator-Id", operatorId);
        using var response = await http.SendAsync(request, token);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(await response.Content.ReadAsStringAsync(token));
    }

    public async Task<(string Phase, int Seconds, bool Running)> AuxiliarySnapshotAsync(CancellationToken token = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/operator/aux-clock");
        request.Headers.Add("X-Operator-Key", operatorKey);
        using var response = await http.SendAsync(request, token);
        response.EnsureSuccessStatusCode();
        using var json = await response.Content.ReadFromJsonAsync<JsonDocument>(cancellationToken: token)
            ?? throw new InvalidOperationException("Empty auxiliary clock response");
        var root = json.RootElement;
        return (root.GetProperty("phase").GetString() ?? "WARMUP",
            root.GetProperty("seconds").GetInt32(), root.GetProperty("running").GetBoolean());
    }
}

public sealed record RinkClockSnapshot(int Revision, int Period, int Seconds, bool Running,
    bool Ended, int Home, int Away, string ClockMode, string TimingVersion, string PenaltiesJson,
    IReadOnlyList<RinkEvent>? Events = null)
{
    public string DisplayTime => $"{Seconds / 60:00}:{Seconds % 60:00}";
}

public sealed record RinkEvent(string Id, string Type, string? Team, string DetailsJson);
