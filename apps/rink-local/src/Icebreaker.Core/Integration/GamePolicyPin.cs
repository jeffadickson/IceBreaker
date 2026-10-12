using System.Text.Json;
using Icebreaker.Core.Mercy;
using Microsoft.Data.Sqlite;

namespace Icebreaker.Core.Integration;

/// <summary>
/// Prevents silently changing league mercy rules or team mapping on restart.
/// A later audited configuration-change command will replace this fixed policy pin.
/// </summary>
public static class GamePolicyPin
{
    public static void VerifyOrCreate(string databasePath, string gameId,
        string homeTeamId, string awayTeamId, MercySettings settings)
    {
        var policy = JsonSerializer.Serialize(new { homeTeamId, awayTeamId, settings }, JsonOptions.Default);
        using var db = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = databasePath }.ToString());
        db.Open();
        using var tx = db.BeginTransaction();
        using (var create = db.CreateCommand())
        {
            create.Transaction = tx;
            create.CommandText = """
                CREATE TABLE IF NOT EXISTS game_policy (
                  game_id TEXT PRIMARY KEY, policy_json TEXT NOT NULL
                )
                """;
            create.ExecuteNonQuery();
        }
        using (var insert = db.CreateCommand())
        {
            insert.Transaction = tx;
            insert.CommandText = "INSERT OR IGNORE INTO game_policy(game_id,policy_json) VALUES($game,$policy)";
            insert.Parameters.AddWithValue("$game", gameId);
            insert.Parameters.AddWithValue("$policy", policy);
            insert.ExecuteNonQuery();
        }
        using (var read = db.CreateCommand())
        {
            read.Transaction = tx;
            read.CommandText = "SELECT policy_json FROM game_policy WHERE game_id=$game";
            read.Parameters.AddWithValue("$game", gameId);
            if (!string.Equals((string?)read.ExecuteScalar(), policy, StringComparison.Ordinal))
                throw new InvalidOperationException("Saved game policy differs. Audited policy changes are not yet supported.");
        }
        tx.Commit();
    }
}
