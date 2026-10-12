using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Icebreaker.Core;

/// <summary>Single-game SQLite authority. Synchronous commands are serialized by a monitor.</summary>
public sealed class GameStore : IDisposable
{
    private readonly object _gate = new();
    private readonly SqliteConnection _db;
    private readonly TextMirror _mirror;
    private readonly string _gameId;
    public bool TextMirrorHealthy { get; private set; }
    public string? LastMirrorError { get; private set; }

    public GameStore(string databasePath, string gameId, string mirrorDirectory)
    {
        if (string.IsNullOrWhiteSpace(gameId)) throw new ArgumentException("Game ID required.", nameof(gameId));
        _gameId = gameId;
        _mirror = new TextMirror(mirrorDirectory);
        var dbDir = Path.GetDirectoryName(Path.GetFullPath(databasePath));
        if (dbDir is not null) Directory.CreateDirectory(dbDir);
        _db = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = databasePath }.ToString());
        _db.Open();
        Execute("PRAGMA journal_mode=WAL;");
        Execute("PRAGMA synchronous=FULL;");
        Execute("PRAGMA foreign_keys=ON;");
        Execute("""
            CREATE TABLE IF NOT EXISTS game_events (
              game_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE,
              idempotency_key TEXT NOT NULL, event_type TEXT NOT NULL,
              occurred_at_utc TEXT NOT NULL, actor_id TEXT NOT NULL,
              period INTEGER NOT NULL, clock_seconds INTEGER NOT NULL,
              payload_json TEXT NOT NULL,
              PRIMARY KEY(game_id, seq), UNIQUE(game_id, idempotency_key)
            );
            CREATE TABLE IF NOT EXISTS sync_outbox (
              event_id TEXT PRIMARY KEY NOT NULL REFERENCES game_events(event_id),
              game_id TEXT NOT NULL, seq INTEGER NOT NULL, delivered INTEGER NOT NULL DEFAULT 0
            );
            """);
        RepairTextMirror();
    }

    public GameView ReadView()
    {
        lock (_gate) return GameProjector.Replay(ReadEventsUnsafe());
    }

    public IReadOnlyList<GameEvent> ReadEvents()
    {
        lock (_gate) return ReadEventsUnsafe();
    }

    public int PendingOutboxCount()
    {
        lock (_gate)
        {
            using var cmd = _db.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM sync_outbox WHERE game_id=$game AND delivered=0";
            cmd.Parameters.AddWithValue("$game", _gameId);
            return Convert.ToInt32(cmd.ExecuteScalar());
        }
    }

    public CommandResult RecordGoal(string key, string actor, int period, int clockSeconds,
        string goalId, string teamId, Attribution scorer, Attribution assist1, Attribution assist2)
    {
        ValidateAttributions(scorer, assist1, assist2);
        RequireId(goalId, nameof(goalId)); RequireId(teamId, nameof(teamId));
        return Commit(key, actor, period, clockSeconds, "GOAL_RECORDED",
            new GoalData(goalId, teamId, scorer, assist1, assist2), view =>
            {
                if (view.Goals.ContainsKey(goalId)) throw new InvalidOperationException("Goal ID already exists.");
            });
    }

    public CommandResult CorrectAttribution(string key, string actor, int period, int clockSeconds,
        string goalId, Attribution scorer, Attribution assist1, Attribution assist2, string reason)
    {
        ValidateAttributions(scorer, assist1, assist2);
        RequireId(goalId, nameof(goalId));
        if (string.IsNullOrWhiteSpace(reason)) throw new ArgumentException("Correction reason required.");
        return Commit(key, actor, period, clockSeconds, "GOAL_ATTRIBUTION_CORRECTED",
            new CorrectionData(goalId, scorer, assist1, assist2, reason), view =>
            {
                if (!view.Goals.TryGetValue(goalId, out var goal) || goal.IsVoided)
                    throw new InvalidOperationException("Unknown/voided goal.");
            });
    }

    public CommandResult AssessPenalty(string key, string actor, int period, int clockSeconds,
        string penaltyId, string teamId, Attribution player, string infraction, int durationSeconds)
    {
        player.Validate();
        RequireId(penaltyId, nameof(penaltyId)); RequireId(teamId, nameof(teamId));
        if (string.IsNullOrWhiteSpace(infraction) || durationSeconds <= 0)
            throw new ArgumentException("Infraction and positive duration required.");
        return Commit(key, actor, period, clockSeconds, "PENALTY_ASSESSED",
            new PenaltyData(penaltyId, teamId, player, infraction, durationSeconds), view =>
            {
                if (view.Penalties.Any(p => p.PenaltyId == penaltyId))
                    throw new InvalidOperationException("Penalty ID already exists.");
            });
    }

    public CommandResult UpdateClock(string key, string actor, int period, int clockSeconds, string action)
    {
        if (action is not ("START" or "STOP" or "SET")) throw new ArgumentException("Unknown clock action.");
        return Commit(key, actor, period, clockSeconds, "CLOCK_UPDATED", new ClockData(action, clockSeconds), _ => { });
    }

    /// <summary>Audited transition; only a policy coordinator should call this.</summary>
    public CommandResult RecordMercyTransition(string key, string actor, int period, int clockSeconds,
        bool active, bool hasTriggered, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new ArgumentException("Reason required.");
        return Commit(key, actor, period, clockSeconds, "MERCY_MODE_CHANGED",
            new MercyModeData(active, hasTriggered, reason), _ => { });
    }

    public CommandResult RecordIgnoredStop(string key, string actor, int period, int clockSeconds,
        string reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) throw new ArgumentException("Reason required.");
        return Commit(key, actor, period, clockSeconds, "CLOCK_STOP_IGNORED",
            new ClockStopIgnoredData(reason), _ => { });
    }

    public bool RepairTextMirror()
    {
        lock (_gate)
        {
            try
            {
                _mirror.Rebuild(ReadEventsUnsafe());
                TextMirrorHealthy = true;
                LastMirrorError = null;
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                TextMirrorHealthy = false;
                LastMirrorError = e.Message;
            }
            return TextMirrorHealthy;
        }
    }

    private CommandResult Commit<T>(string key, string actor, int period, int clockSeconds,
        string eventType, T payload, Action<GameView> validate)
    {
        RequireId(key, nameof(key)); RequireId(actor, nameof(actor));
        if (period < 1 || clockSeconds < 0) throw new ArgumentOutOfRangeException(nameof(period));
        lock (_gate)
        {
            // Idempotency must be checked before state-dependent validation.
            var existing = FindByKeyUnsafe(key);
            if (existing is not null) return new CommandResult(existing, true, TextMirrorHealthy);
            var events = ReadEventsUnsafe();
            validate(GameProjector.Replay(events));
            var ev = new GameEvent(events.Count + 1, Guid.NewGuid().ToString("N"), _gameId,
                key, eventType, DateTimeOffset.UtcNow, actor, period, clockSeconds,
                JsonSerializer.Serialize(payload, JsonOptions.Default));
            using (var tx = _db.BeginTransaction())
            {
                using (var cmd = _db.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText = """
                        INSERT INTO game_events(game_id,seq,event_id,idempotency_key,event_type,occurred_at_utc,actor_id,period,clock_seconds,payload_json)
                        VALUES($game,$seq,$id,$key,$type,$utc,$actor,$period,$clock,$payload)
                        """;
                    cmd.Parameters.AddWithValue("$game", ev.GameId);
                    cmd.Parameters.AddWithValue("$seq", ev.Sequence);
                    cmd.Parameters.AddWithValue("$id", ev.EventId);
                    cmd.Parameters.AddWithValue("$key", ev.IdempotencyKey);
                    cmd.Parameters.AddWithValue("$type", ev.EventType);
                    cmd.Parameters.AddWithValue("$utc", ev.OccurredAtUtc.ToString("O"));
                    cmd.Parameters.AddWithValue("$actor", ev.ActorId);
                    cmd.Parameters.AddWithValue("$period", ev.Period);
                    cmd.Parameters.AddWithValue("$clock", ev.ClockSeconds);
                    cmd.Parameters.AddWithValue("$payload", ev.PayloadJson);
                    cmd.ExecuteNonQuery();
                }
                using (var cmd = _db.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText = "INSERT INTO sync_outbox(event_id,game_id,seq) VALUES($id,$game,$seq)";
                    cmd.Parameters.AddWithValue("$id", ev.EventId);
                    cmd.Parameters.AddWithValue("$game", ev.GameId);
                    cmd.Parameters.AddWithValue("$seq", ev.Sequence);
                    cmd.ExecuteNonQuery();
                }
                tx.Commit();
            }
            // A mirror failure must never roll back an already accepted official event.
            RepairTextMirror();
            return new CommandResult(ev, false, TextMirrorHealthy);
        }
    }

    private GameEvent? FindByKeyUnsafe(string key)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            SELECT seq,event_id,game_id,idempotency_key,event_type,occurred_at_utc,actor_id,period,clock_seconds,payload_json
            FROM game_events WHERE game_id=$game AND idempotency_key=$key
            """;
        cmd.Parameters.AddWithValue("$game", _gameId);
        cmd.Parameters.AddWithValue("$key", key);
        using var r = cmd.ExecuteReader();
        return r.Read() ? FromReader(r) : null;
    }

    private List<GameEvent> ReadEventsUnsafe()
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            SELECT seq,event_id,game_id,idempotency_key,event_type,occurred_at_utc,actor_id,period,clock_seconds,payload_json
            FROM game_events WHERE game_id=$game ORDER BY seq
            """;
        cmd.Parameters.AddWithValue("$game", _gameId);
        using var r = cmd.ExecuteReader();
        var events = new List<GameEvent>();
        while (r.Read()) events.Add(FromReader(r));
        return events;
    }

    private static GameEvent FromReader(SqliteDataReader r) => new(
        r.GetInt64(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4),
        DateTimeOffset.Parse(r.GetString(5), System.Globalization.CultureInfo.InvariantCulture),
        r.GetString(6), r.GetInt32(7), r.GetInt32(8), r.GetString(9));

    private void Execute(string sql)
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    private static void RequireId(string value, string name)
    {
        if (string.IsNullOrWhiteSpace(value)) throw new ArgumentException("Value required.", name);
    }

    private static void ValidateAttributions(Attribution scorer, Attribution a1, Attribution a2)
    {
        scorer.Validate(isScorer: true); a1.Validate(); a2.Validate();
        var ids = new[] { scorer, a1, a2 }.Where(a => a.Kind == AttributionKind.Player)
            .Select(a => a.PlayerId).ToArray();
        if (ids.Distinct(StringComparer.Ordinal).Count() != ids.Length)
            throw new ArgumentException("Scorer and assists must refer to distinct players.");
    }

    public void Dispose() => _db.Dispose();
}
