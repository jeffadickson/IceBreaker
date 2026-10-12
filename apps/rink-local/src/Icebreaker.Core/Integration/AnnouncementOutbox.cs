using Icebreaker.Core.Announcements;
using Microsoft.Data.Sqlite;

namespace Icebreaker.Core.Integration;

public enum AnnouncementDeliveryState { PendingApproval, Ready, Playing, Completed, Skipped, NeedsReview }

public sealed record QueuedAnnouncement(string Id, string Script, AnnouncementKind Kind,
    AnnouncementDeliveryState State, long? SourceSequence, bool RequiresApproval);

/// <summary>
/// Durable, idempotent PA queue. Claims mark Playing BEFORE audio begins; after a crash,
/// uncertain Playing items are quarantined instead of replayed automatically.
/// This is an at-most-once automatic playback policy, not guaranteed audible delivery.
/// </summary>
public sealed class AnnouncementOutbox : IDisposable
{
    private readonly SqliteConnection _db;
    private readonly string _gameId;
    private readonly object _gate = new();

    public AnnouncementOutbox(string databasePath, string gameId)
    {
        _gameId = gameId;
        _db = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = databasePath }.ToString());
        _db.Open();
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS announcement_outbox (
              announcement_id TEXT PRIMARY KEY,
              game_id TEXT NOT NULL,
              source_seq INTEGER NULL,
              kind TEXT NOT NULL,
              script TEXT NOT NULL,
              requires_approval INTEGER NOT NULL,
              state TEXT NOT NULL,
              created_at_utc TEXT NOT NULL
            );
            """;
        cmd.ExecuteNonQuery();
    }

    public void Stage(Announcement announcement, bool recovered = false)
    {
        if (announcement.GameId != _gameId) throw new ArgumentException("Announcement game mismatch.");
        var state = recovered ? AnnouncementDeliveryState.NeedsReview :
            announcement.RequiresApproval ? AnnouncementDeliveryState.PendingApproval : AnnouncementDeliveryState.Ready;
        lock (_gate)
        {
            using var cmd = _db.CreateCommand();
            cmd.CommandText = """
                INSERT OR IGNORE INTO announcement_outbox
                  (announcement_id,game_id,source_seq,kind,script,requires_approval,state,created_at_utc)
                VALUES($id,$game,$seq,$kind,$script,$approval,$state,$utc)
                """;
            cmd.Parameters.AddWithValue("$id", announcement.Id);
            cmd.Parameters.AddWithValue("$game", _gameId);
            cmd.Parameters.AddWithValue("$seq", (object?)announcement.SourceSequence ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$kind", announcement.Kind.ToString());
            cmd.Parameters.AddWithValue("$script", announcement.Script);
            cmd.Parameters.AddWithValue("$approval", announcement.RequiresApproval ? 1 : 0);
            cmd.Parameters.AddWithValue("$state", state.ToString());
            cmd.Parameters.AddWithValue("$utc", DateTimeOffset.UtcNow.ToString("O"));
            cmd.ExecuteNonQuery();
        }
    }

    public IReadOnlyList<QueuedAnnouncement> ReadAll()
    {
        lock (_gate)
        {
            using var cmd = _db.CreateCommand();
            cmd.CommandText = """
                SELECT announcement_id,script,kind,state,source_seq,requires_approval
                FROM announcement_outbox WHERE game_id=$game
                ORDER BY created_at_utc, announcement_id
                """;
            cmd.Parameters.AddWithValue("$game", _gameId);
            using var r = cmd.ExecuteReader();
            var result = new List<QueuedAnnouncement>();
            while (r.Read())
                result.Add(new QueuedAnnouncement(r.GetString(0), r.GetString(1),
                    Enum.Parse<AnnouncementKind>(r.GetString(2)),
                    Enum.Parse<AnnouncementDeliveryState>(r.GetString(3)),
                    r.IsDBNull(4) ? null : r.GetInt64(4), r.GetInt32(5) != 0));
            return result;
        }
    }

    public void QuarantineUnsentOnStartup()
    {
        lock (_gate)
        {
            using var cmd = _db.CreateCommand();
            cmd.CommandText = """
                UPDATE announcement_outbox SET state='NeedsReview'
                WHERE game_id=$game AND state IN ('Playing','Ready')
                """;
            cmd.Parameters.AddWithValue("$game", _gameId);
            cmd.ExecuteNonQuery();
        }
    }

    public void Approve(string id)
    {
        if (Transition(id, "Ready", "PendingApproval", "NeedsReview") != 1)
            throw new InvalidOperationException("Announcement cannot be approved in its current state.");
    }

    public bool Claim(string id) => Transition(id, "Playing", "Ready") == 1;

    public void Complete(string id)
    {
        if (Transition(id, "Completed", "Playing") != 1)
            throw new InvalidOperationException("Only a claimed announcement can be completed.");
    }

    public void Skip(string id)
    {
        if (Transition(id, "Skipped", "Ready", "PendingApproval", "NeedsReview") != 1)
            throw new InvalidOperationException("Cannot skip announcement in current state.");
    }

    private int Transition(string id, string to, params string[] from)
    {
        lock (_gate)
        {
            using var cmd = _db.CreateCommand();
            var states = new List<string>();
            for (int i = 0; i < from.Length; i++)
            {
                string parameter = "$from" + i;
                states.Add(parameter);
                cmd.Parameters.AddWithValue(parameter, from[i]);
            }
            cmd.CommandText = $"UPDATE announcement_outbox SET state=$to WHERE game_id=$game AND announcement_id=$id AND state IN ({string.Join(",", states)})";
            cmd.Parameters.AddWithValue("$to", to);
            cmd.Parameters.AddWithValue("$game", _gameId);
            cmd.Parameters.AddWithValue("$id", id);
            return cmd.ExecuteNonQuery();
        }
    }

    public void Dispose() => _db.Dispose();
}
