using System.Text.Json;
using Icebreaker.Core.Integration;
using Microsoft.Data.Sqlite;

namespace Icebreaker.Timekeeper.Desktop;

/// <summary>
/// Persistent, operator-approved PA scripts derived only from committed events.
/// Audio is never generated on ingestion. A crash during playback quarantines
/// the uncertain item instead of automatically replaying it over arena speakers.
/// </summary>
public sealed class AnnouncementQueue : IDisposable
{
    private readonly SqliteConnection _db;
    public AnnouncementQueue(string file)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(file))!);
        _db = new SqliteConnection($"Data Source={file}");
        _db.Open();
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS desktop_pa_queue(
              event_id TEXT PRIMARY KEY, kind TEXT NOT NULL, script TEXT NOT NULL,
              state TEXT NOT NULL, created_utc TEXT NOT NULL);
            UPDATE desktop_pa_queue SET state='NEEDS_REVIEW' WHERE state='PLAYING';
            """;
        cmd.ExecuteNonQuery();
    }

    public static string? ScriptFor(RinkEvent e)
    {
        if (e.Type is not ("GOAL_RECORDED" or "PENALTY_ASSESSED")) return null;
        if (e.Team is not ("home" or "away")) return null;
        using var json = JsonDocument.Parse(e.DetailsJson);
        var details = json.RootElement;
        static string Field(JsonElement d, string name) =>
            d.TryGetProperty(name, out var v) ? v.ToString() : "";
        static string Jersey(string s) => s is "TBD" or "" ? "to be announced" :
            System.Text.RegularExpressions.Regex.IsMatch(s, @"^\d{1,3}$") ? "number " + s : "to be announced";
        var team = e.Team == "home" ? "home team" : "visiting team";
        if (e.Type == "GOAL_RECORDED")
        {
            var scorer = Jersey(Field(details, "scorer"));
            var assists = new[] { Field(details, "assist1"), Field(details, "assist2") }
                .Where(x => x is not ("" or "None" or "TBD"))
                .Select(Jersey).ToArray();
            return $"Goal for the {team}! Scored by {scorer}." +
                   (assists.Length > 0 ? " Assisted by " + string.Join(" and ", assists) + "." : "");
        }
        var player = Jersey(Field(details, "player"));
        var infraction = Field(details, "infraction");
        if (infraction.Length is < 1 or > 100 || infraction.Any(char.IsControl)) return null;
        // Do not forward arbitrary operator-entered text (potential youth PII)
        // to a hosted voice provider. Unknown penalty names use generic wording.
        var known = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Tripping", "Hooking", "Holding", "Interference", "Slashing",
            "Cross-checking", "High-sticking", "Roughing", "Boarding",
            "Charging", "Elbowing", "Kneeing", "Spearing", "Butt-ending",
            "Unsportsmanlike conduct", "Too many players", "Too many men",
            "Delay of game", "Goaltender interference", "Fighting",
            "Misconduct", "Game misconduct", "Checking from behind",
            "Head contact", "Illegal check to the head", "Obstruction",
            "Holding the stick", "Embellishment", "Abuse of officials",
            "Illegal equipment", "Bench minor"
        };
        if (!known.Contains(infraction)) infraction = "an infraction";
        if (!int.TryParse(Field(details, "duration"), out var seconds) || seconds < 1 || seconds > 3600) return null;
        return $"Penalty to the {team}, {player}. {seconds / 60} minutes" +
               (seconds % 60 > 0 ? $" and {seconds % 60} seconds" : "") +
               $" for {infraction}.";
    }

    public void Stage(RinkEvent e, bool recovered = false)
    {
        if (string.IsNullOrWhiteSpace(e.Id)) return;
        var script = ScriptFor(e);
        if (script is null) return;
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            INSERT OR IGNORE INTO desktop_pa_queue(event_id,kind,script,state,created_utc)
            VALUES($id,$kind,$script,$state,$at)
            """;
        cmd.Parameters.AddWithValue("$id", e.Id);
        cmd.Parameters.AddWithValue("$kind", e.Type);
        cmd.Parameters.AddWithValue("$script", script);
        cmd.Parameters.AddWithValue("$state", recovered ? "NEEDS_REVIEW" : "PENDING");
        cmd.Parameters.AddWithValue("$at", DateTimeOffset.UtcNow.ToString("O"));
        cmd.ExecuteNonQuery();
    }

    public IReadOnlyList<AnnouncementItem> Read()
    {
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            SELECT event_id,kind,script,state FROM desktop_pa_queue
            WHERE state IN ('PENDING','NEEDS_REVIEW')
            ORDER BY created_utc,event_id LIMIT 100
            """;
        using var reader = cmd.ExecuteReader();
        var result = new List<AnnouncementItem>();
        while (reader.Read())
            result.Add(new AnnouncementItem(reader.GetString(0), reader.GetString(1),
                reader.GetString(2), reader.GetString(3)));
        return result;
    }

    public void Mark(string id, string next, params string[] allowed)
    {
        if (next is not ("PLAYING" or "PLAYED" or "SKIPPED" or "NEEDS_REVIEW"))
            throw new ArgumentException("Invalid PA transition", nameof(next));
        if (allowed.Length == 0) throw new ArgumentException("Expected prior state required", nameof(allowed));
        using var cmd = _db.CreateCommand();
        var placeholders = new List<string>();
        for (var i = 0; i < allowed.Length; i++)
        {
            var name = "$prior" + i;
            placeholders.Add(name);
            cmd.Parameters.AddWithValue(name, allowed[i]);
        }
        cmd.CommandText = $"UPDATE desktop_pa_queue SET state=$next WHERE event_id=$id AND state IN ({string.Join(",", placeholders)})";
        cmd.Parameters.AddWithValue("$next", next);
        cmd.Parameters.AddWithValue("$id", id);
        if (cmd.ExecuteNonQuery() != 1) throw new InvalidOperationException("Announcement state changed; refresh queue");
    }

    public void Dispose() => _db.Dispose();
}
public sealed record AnnouncementItem(string Id, string Kind, string Script, string State)
{
    public override string ToString() => $"{State}: {Script}";
}
