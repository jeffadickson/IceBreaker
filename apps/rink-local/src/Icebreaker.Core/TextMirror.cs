using System.Text;
using System.Text.Json;

namespace Icebreaker.Core;

/// <summary>Recoverable, non-authoritative projections of the SQLite journal.</summary>
public sealed class TextMirror
{
    private readonly string _directory;
    public TextMirror(string directory) => _directory = directory;
    public string JsonlPath => Path.Combine(_directory, "game-events.jsonl");
    public string ReadablePath => Path.Combine(_directory, "game-events.log");

    public void Rebuild(IReadOnlyList<GameEvent> events)
    {
        Directory.CreateDirectory(_directory);
        // Each file is replaced atomically. If the process dies between replacements,
        // both are reconciled against SQLite at the next startup.
        WriteAtomically(JsonlPath, events.Select(e => JsonSerializer.Serialize(e, JsonOptions.Default)));
        WriteAtomically(ReadablePath, events.Select(Format));
    }

    private static string Format(GameEvent e)
    {
        string detail = e.EventType switch
        {
            "GOAL_RECORDED" => FormatGoal(e.Payload<GoalData>()),
            "GOAL_ATTRIBUTION_CORRECTED" => FormatCorrection(e.Payload<CorrectionData>()),
            "PENALTY_ASSESSED" => JsonSerializer.Serialize(e.Payload<PenaltyData>(), JsonOptions.Default),
            "CLOCK_UPDATED" => JsonSerializer.Serialize(e.Payload<ClockData>(), JsonOptions.Default),
            _ => e.PayloadJson
        };
        // JSON-escape all user-entered fields; one physical line per event.
        return $"seq={e.Sequence:D8} id={e.EventId} utc={e.OccurredAtUtc:O} game={JsonSerializer.Serialize(e.GameId)} actor={JsonSerializer.Serialize(e.ActorId)} period={e.Period} clock={e.ClockSeconds} type={e.EventType} detail={detail}";
    }

    private static string FormatGoal(GoalData g) => JsonSerializer.Serialize(g, JsonOptions.Default);
    private static string FormatCorrection(CorrectionData c) => JsonSerializer.Serialize(c, JsonOptions.Default);

    private static void WriteAtomically(string target, IEnumerable<string> lines)
    {
        var temp = target + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var fs = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            using (var writer = new StreamWriter(fs, new UTF8Encoding(false)))
            {
                foreach (var line in lines) writer.WriteLine(line);
                writer.Flush();
                fs.Flush(flushToDisk: true);
            }
            File.Move(temp, target, overwrite: true);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
}
