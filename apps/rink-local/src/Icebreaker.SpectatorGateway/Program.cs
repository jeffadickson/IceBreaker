using System.Globalization;
using System.Text.Json;
using System.Threading.Channels;
using Icebreaker.Core;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;

// DEVELOPMENT VERTICAL SLICE: read-only spectator projection from the SQLite
// authority. No operator commands. Default listener is loopback only.
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(Environment.GetEnvironmentVariable("ICEBREAKER_LISTEN") ?? "http://127.0.0.1:5080");
builder.Services.AddSignalR();
builder.Services.AddSingleton(new SpectatorReader(
    Environment.GetEnvironmentVariable("ICEBREAKER_GAME_DB") ?? "game.db",
    Environment.GetEnvironmentVariable("ICEBREAKER_GAME_ID") ?? "demo"));
builder.Services.AddSingleton<SnapshotFanout>();
builder.Services.AddHostedService<SnapshotPollingService>();
var app = builder.Build();
app.MapGet("/api/games/demo/snapshot", (SpectatorReader reader) => Results.Json(reader.Read()));
app.MapGet("/api/games/demo/events", async (HttpContext context, SpectatorReader reader, SnapshotFanout fanout) =>
{
    context.Response.Headers["Cache-Control"] = "no-store, no-transform";
    context.Response.ContentType = "text/event-stream; charset=utf-8";
    context.Response.Headers.Append("X-Accel-Buffering", "no");
    await context.Response.WriteAsync("retry: 1500\n\n", context.RequestAborted);
    var subscription = fanout.Subscribe();
    await WriteSnapshot(reader.Read());
    try
    {
        await foreach (var snapshot in subscription.Reader.ReadAllAsync(context.RequestAborted))
            await WriteSnapshot(snapshot);
    }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
    finally { fanout.Unsubscribe(subscription.Id); }

    async Task WriteSnapshot(SpectatorSnapshot snapshot)
    {
        await context.Response.WriteAsync($"id: {snapshot.revision}\nevent: snapshot\ndata: {JsonSerializer.Serialize(snapshot)}\n\n", context.RequestAborted);
        await context.Response.Body.FlushAsync(context.RequestAborted);
    }
});
app.MapHub<SpectatorHub>("/hubs/live");
app.Run();

public sealed class SpectatorHub(SpectatorReader reader) : Hub
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("snapshot", reader.Read());
        await base.OnConnectedAsync();
    }
    // Intentionally no scoring or clock commands on this public hub.
}

public sealed record SpectatorSnapshot(long revision, int period, int seconds, bool running,
    IReadOnlyDictionary<string, int> scores, object[] events,
    IReadOnlyDictionary<string, string> teams, bool connected, string scorePolicy);

public sealed class SpectatorReader(string dbPath, string gameId)
{
    public SpectatorSnapshot Read()
    {
        if (!File.Exists(dbPath))
            return new SpectatorSnapshot(0, 1, 900, false, new Dictionary<string, int> { ["home"] = 0, ["away"] = 0 },
                [], new Dictionary<string, string> { ["home"] = "Pasadena Maple Leafs", ["away"] = "Santa Clarita Flyers" },
                false, "FULL_OFFICIAL");
        var events = new List<GameEvent>();
        using var db = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadOnly
        }.ToString());
        db.Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = """
            SELECT seq,event_id,game_id,idempotency_key,event_type,occurred_at_utc,actor_id,period,clock_seconds,payload_json
            FROM game_events WHERE game_id=$game ORDER BY seq
            """;
        cmd.Parameters.AddWithValue("$game", gameId);
        using var rows = cmd.ExecuteReader();
        while (rows.Read())
        {
            events.Add(new GameEvent(rows.GetInt64(0), rows.GetString(1), rows.GetString(2), rows.GetString(3),
                rows.GetString(4), DateTimeOffset.Parse(rows.GetString(5), CultureInfo.InvariantCulture),
                rows.GetString(6), rows.GetInt32(7), rows.GetInt32(8), rows.GetString(9)));
        }
        var view = GameProjector.Replay(events);
        // Core corrections reference GoalId, while the web feed references the original
        // event ID. Resolve that relationship without exposing internal identifiers.
        var goalEventIds = events.Where(e => e.EventType == "GOAL_RECORDED")
            .ToDictionary(e => e.Payload<GoalData>().GoalId, e => e.EventId, StringComparer.Ordinal);
        var publicEvents = events.Select(e => ProjectEvent(e, goalEventIds)).Where(e => e is not null).Cast<object>().ToArray();
        // IMPORTANT: true score, never mercy-capped. No actor IDs or raw payloads.
        return new SpectatorSnapshot(view.Sequence, view.Period, view.ClockSeconds, view.ClockRunning,
            new Dictionary<string, int> { ["home"] = view.Scores.GetValueOrDefault("home"), ["away"] = view.Scores.GetValueOrDefault("away") },
            publicEvents, new Dictionary<string, string> { ["home"] = "Pasadena Maple Leafs", ["away"] = "Santa Clarita Flyers" },
            true, "FULL_OFFICIAL");
    }

    private static object? ProjectEvent(GameEvent e, IReadOnlyDictionary<string, string> goalEventIds)
    {
        object? details = e.EventType switch
        {
            "GOAL_RECORDED" => GoalDetails(e.Payload<GoalData>()),
            "GOAL_ATTRIBUTION_CORRECTED" => CorrectionDetails(e.Payload<CorrectionData>(), goalEventIds),
            "PENALTY_ASSESSED" => PenaltyDetails(e.Payload<PenaltyData>()),
            "PERIOD_ENDED" or "PERIOD_ADVANCED" or "GAME_ENDED" => new { },
            _ => null // No clock operations, mercy settings, or operator data in feed.
        };
        if (details is null) return null;
        string? team = e.EventType switch
        {
            "GOAL_RECORDED" => e.Payload<GoalData>().TeamId,
            "PENALTY_ASSESSED" => e.Payload<PenaltyData>().TeamId,
            _ => null
        };
        return new { id = e.EventId, type = e.EventType, team, period = e.Period,
            seconds = e.ClockSeconds, at = e.OccurredAtUtc, details };
    }
    private static string Attr(Attribution a) => a.Kind switch
    {
        AttributionKind.Tbd => "TBD",
        AttributionKind.None => "None",
        _ => a.PlayerId ?? "TBD"
    };
    private static object GoalDetails(GoalData d) => new { scorer = Attr(d.Scorer), assist1 = Attr(d.Assist1), assist2 = Attr(d.Assist2) };
    private static object CorrectionDetails(CorrectionData d, IReadOnlyDictionary<string, string> goalEventIds) => new { originalEventId = goalEventIds.GetValueOrDefault(d.GoalId, d.GoalId), scorer = Attr(d.Scorer), assist1 = Attr(d.Assist1), assist2 = Attr(d.Assist2) };
    private static object PenaltyDetails(PenaltyData d) => new { player = Attr(d.Player), infraction = d.Infraction, duration = d.DurationSeconds };
}

public sealed class SnapshotFanout
{
    private readonly object _gate = new();
    private readonly Dictionary<Guid, Channel<SpectatorSnapshot>> _listeners = [];
    public (Guid Id, ChannelReader<SpectatorSnapshot> Reader) Subscribe()
    {
        var id = Guid.NewGuid();
        var channel = Channel.CreateBounded<SpectatorSnapshot>(new BoundedChannelOptions(1)
        { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true, SingleWriter = false });
        lock (_gate) _listeners.Add(id, channel);
        return (id, channel.Reader);
    }
    public void Unsubscribe(Guid id)
    {
        lock (_gate) if (_listeners.Remove(id, out var channel)) channel.Writer.TryComplete();
    }
    public void Publish(SpectatorSnapshot snapshot)
    {
        lock (_gate) foreach (var channel in _listeners.Values) channel.Writer.TryWrite(snapshot);
    }
}

public sealed class SnapshotPollingService(
    SpectatorReader reader, SnapshotFanout fanout, IHubContext<SpectatorHub> hub, ILogger<SnapshotPollingService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        long lastRevision = -1;
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(400));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                var snapshot = reader.Read();
                if (snapshot.revision == lastRevision) continue;
                lastRevision = snapshot.revision;
                fanout.Publish(snapshot);
                await hub.Clients.All.SendAsync("snapshot", snapshot, stoppingToken);
            }
            catch (Exception ex) { log.LogError(ex, "Spectator projection failed; previous revision retained"); }
        }
    }
}
