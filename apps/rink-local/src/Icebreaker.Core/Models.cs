using System.Text.Json;
using System.Text.Json.Serialization;

namespace Icebreaker.Core;

public enum AttributionKind { Player, Tbd, None }

public sealed record Attribution(AttributionKind Kind, string? PlayerId = null)
{
    public static Attribution Player(string id) => new(AttributionKind.Player, id);
    public static Attribution Tbd => new(AttributionKind.Tbd);
    public static Attribution None => new(AttributionKind.None);

    public void Validate(bool isScorer = false)
    {
        if (Kind == AttributionKind.Player && string.IsNullOrWhiteSpace(PlayerId))
            throw new ArgumentException("Player attribution requires a player ID.");
        if (Kind != AttributionKind.Player && PlayerId is not null)
            throw new ArgumentException("Only a player attribution may contain a player ID.");
        if (isScorer && Kind == AttributionKind.None)
            throw new ArgumentException("Goal scorer cannot be NONE; use TBD.");
    }
}

public sealed record GoalData(string GoalId, string TeamId, Attribution Scorer, Attribution Assist1, Attribution Assist2);
public sealed record CorrectionData(string GoalId, Attribution Scorer, Attribution Assist1, Attribution Assist2, string Reason);
public sealed record PenaltyData(string PenaltyId, string TeamId, Attribution Player, string Infraction, int DurationSeconds);
public sealed record ClockData(string Action, int SecondsRemaining);
public sealed record MercyModeData(bool Active, bool HasTriggered, string Reason);
public sealed record ClockStopIgnoredData(string Reason);

public sealed record GameEvent(long Sequence, string EventId, string GameId, string IdempotencyKey,
    string EventType, DateTimeOffset OccurredAtUtc, string ActorId, int Period, int ClockSeconds,
    string PayloadJson)
{
    public T Payload<T>() => JsonSerializer.Deserialize<T>(PayloadJson, JsonOptions.Default)
        ?? throw new InvalidDataException("Invalid event payload.");
}

public static class JsonOptions
{
    public static readonly JsonSerializerOptions Default = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };
}

public sealed record GoalView(string GoalId, string TeamId, Attribution Scorer, Attribution Assist1,
    Attribution Assist2, bool IsVoided = false)
{
    public bool HasTbd => !IsVoided && (Scorer.Kind == AttributionKind.Tbd ||
        Assist1.Kind == AttributionKind.Tbd || Assist2.Kind == AttributionKind.Tbd);
}

public sealed record GameView(long Sequence, IReadOnlyDictionary<string, int> Scores,
    IReadOnlyDictionary<string, GoalView> Goals, IReadOnlyList<PenaltyData> Penalties,
    int Period, int ClockSeconds, bool ClockRunning, bool MercyActive = false, bool MercyTriggered = false)
{
    public IReadOnlyList<GoalView> Unresolved => Goals.Values.Where(g => g.HasTbd).ToArray();
}

public sealed record CommandResult(GameEvent Event, bool WasDuplicate, bool TextMirrorHealthy);
