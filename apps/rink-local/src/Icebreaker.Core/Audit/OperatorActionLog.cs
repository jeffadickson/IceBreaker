using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Icebreaker.Core.Audit;

/// <summary>
/// Separate append-only diagnostic record of meaningful operator actions, including
/// draft changes, cancellations, confirmations and rejected commands. Not the official
/// game event journal. A failure is surfaced to the caller, never swallowed.
/// One writer per file; cross-process locking is intentionally not provided.
/// </summary>
public sealed class OperatorActionLog : IDisposable
{
    private readonly object _gate = new();
    private readonly FileStream _stream;
    private long _sequence;
    private string _previousHash = new string('0', 64);
    private bool _disposed;

    public OperatorActionLog(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        if (File.Exists(path))
        {
            foreach (var line in File.ReadLines(path))
            {
                if (string.IsNullOrWhiteSpace(line)) throw new InvalidDataException("Blank line in audit chain.");
                var entry = JsonSerializer.Deserialize<OperatorAuditEntry>(line, JsonOptions.Default)
                    ?? throw new InvalidDataException("Invalid audit entry.");
                if (entry.Sequence != _sequence + 1 || entry.PreviousHash != _previousHash ||
                    entry.Hash != ComputeHash(entry with { Hash = string.Empty }))
                    throw new InvalidDataException("Operator audit log integrity check failed.");
                _sequence = entry.Sequence;
                _previousHash = entry.Hash;
            }
        }
        _stream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read, 4096,
            FileOptions.WriteThrough);
    }

    public OperatorAuditEntry Record(string sessionId, string operatorId, string action,
        string? gameId, string? draftId, string? officialEventId, object? details = null)
    {
        if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(operatorId) ||
            string.IsNullOrWhiteSpace(action)) throw new ArgumentException("Session, operator and action are required.");
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            var entry = new OperatorAuditEntry(_sequence + 1, DateTimeOffset.UtcNow,
                sessionId, operatorId, action, gameId, draftId, officialEventId,
                details is null ? null : JsonSerializer.Serialize(details, JsonOptions.Default),
                _previousHash, string.Empty);
            entry = entry with { Hash = ComputeHash(entry) };
            byte[] bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(entry, JsonOptions.Default) + "\n");
            _stream.Write(bytes);
            _stream.Flush(flushToDisk: true);
            _sequence = entry.Sequence;
            _previousHash = entry.Hash;
            return entry;
        }
    }

    private static string ComputeHash(OperatorAuditEntry entry)
    {
        var content = JsonSerializer.Serialize(entry with { Hash = string.Empty }, JsonOptions.Default);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(content))).ToLowerInvariant();
    }

    public void Dispose()
    {
        lock (_gate)
        {
            if (_disposed) return;
            _disposed = true;
            _stream.Dispose();
        }
    }
}

public sealed record OperatorAuditEntry(long Sequence, DateTimeOffset OccurredAtUtc,
    string SessionId, string OperatorId, string Action, string? GameId,
    string? DraftId, string? OfficialEventId, string? DetailsJson,
    string PreviousHash, string Hash);
