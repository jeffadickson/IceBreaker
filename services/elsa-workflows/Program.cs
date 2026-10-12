using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Elsa.Extensions;
using Elsa.Persistence.EFCore.Extensions;
using Elsa.Persistence.EFCore.Modules.Management;
using Elsa.Persistence.EFCore.Modules.Runtime;
using Elsa.Workflows;
using Elsa.Workflows.Activities;
using Microsoft.Data.Sqlite;

// Orchestration adapter, NOT IceBreaker's scoring/signature authority.
// Published revision/digest remain immutable and must be validated upstream.
var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;
var secret = config["ICEBREAKER_ELSA_BRIDGE_KEY"];
if (string.IsNullOrWhiteSpace(secret) || secret.Length < 32)
    throw new InvalidOperationException("ICEBREAKER_ELSA_BRIDGE_KEY requires a private random secret of at least 32 characters.");

// Elsa's own management and workflow runtime stores are now persisted using its
// official EF Core SQLite provider, rather than in-memory Elsa runtime stores.
// Put each instance of this service on its own host during development.
builder.Services.AddElsa(elsa =>
{
    elsa.UseWorkflows();
    elsa.UseWorkflowManagement(management => management.UseEntityFrameworkCore(ef => ef.UseSqlite()));
    elsa.UseWorkflowRuntime(runtime => runtime.UseEntityFrameworkCore(ef => ef.UseSqlite()));
});
builder.Services.AddSingleton<ReceiptInbox>(_ => new ReceiptInbox(
    config["ICEBREAKER_ELSA_INBOX_DB"] ?? "icebreaker-elsa-inbox.sqlite"));

var app = builder.Build();
// A live health response means the HTTP host is responsive. It does not prove
// an event was delivered or that the certification service has finished.
app.MapGet("/healthz", () => Results.Ok(new { status = "ok", engine = "Elsa 3.8", persistence = "efcore-sqlite" }));
app.MapPost("/api/icebreaker/workflow-events", async (HttpRequest request, IWorkflowRunner runner, ReceiptInbox inbox) =>
{
    // Private network or TLS only; never expose this shared-key endpoint publicly.
    var supplied = request.Headers["X-IceBreaker-Workflow-Key"].ToString();
    if (!FixedEquals(supplied, secret!)) return Results.Unauthorized();
    if (request.ContentLength is > 16384) return Results.StatusCode(413);

    WorkflowEvent? message;
    try { message = await request.ReadFromJsonAsync<WorkflowEvent>(); }
    catch (Exception e) when (e is JsonException or BadHttpRequestException) { return Results.BadRequest("Invalid JSON envelope"); }
    if (message is null || !Valid(message)) return Results.BadRequest("Invalid workflow envelope");

    // A duplicate with a different payload is an integrity conflict, not success.
    var received = inbox.Reserve(message);
    if (received == InboxResult.Conflict) return Results.Conflict("Event ID reused with different payload");
    if (received == InboxResult.Completed) return Results.Ok(new { accepted = true, duplicate = true });
    if (received == InboxResult.Busy) return Results.StatusCode(503); // retry later

    try
    {
        // This is an actual Elsa activity run. It records the verified transition;
        // it does not decide or perform certification, change game state, or email.
        var workflow = new Sequence
        {
            Activities =
            {
                new WriteLine($"IceBreaker Elsa received {message.Action} game={message.GameId} revision={message.Revision} id={message.EventId} state={message.State}")
            }
        };
        await runner.RunAsync(workflow);
        inbox.Complete(message.EventId);
        return Results.Accepted($"/api/icebreaker/workflow-events/{Uri.EscapeDataString(message.EventId)}",
            new { accepted = true, duplicate = false });
    }
    catch
    {
        inbox.Release(message.EventId); // keep event retryable in durable upstream outbox
        throw;
    }
});
app.Run();

static bool Valid(WorkflowEvent x) =>
    x.EventId is { Length: >= 16 and <= 128 } && x.EventId.All(Uri.IsHexDigit) &&
    !string.IsNullOrWhiteSpace(x.GameId) && x.GameId.Length <= 128 &&
    !string.IsNullOrWhiteSpace(x.Action) && x.Action.Length <= 100 &&
    !string.IsNullOrWhiteSpace(x.DefinitionDigest) && x.DefinitionDigest.Length <= 128 &&
    x.Revision >= 0 && (x.State?.Length ?? 0) <= 100;
static bool FixedEquals(string supplied, string expected)
{
    var a = SHA256.HashData(Encoding.UTF8.GetBytes(supplied));
    var b = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
    return CryptographicOperations.FixedTimeEquals(a, b) && supplied.Length == expected.Length;
}
public record WorkflowEvent(string EventId, string GameId, string Action, long Revision, string DefinitionDigest, string? State);
public enum InboxResult { New, Completed, Busy, Conflict }

// Receiver receipt ledger is durable, unlike the old ConcurrentDictionary.
// Elsa and inbox use independent stores: exact-once execution across a crash
// between RunAsync and Complete is NOT guaranteed. Activities must remain
// idempotent; upstream retries use the same event ID. No external side effects
// may be added without their own durable idempotency receipts.
public sealed class ReceiptInbox
{
    private readonly string _connection;
    private readonly object _gate = new();
    public ReceiptInbox(string path)
    {
        _connection = new SqliteConnectionStringBuilder { DataSource = path }.ToString();
        using var db = Open();
        using var cmd = db.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS receipts (
              event_id TEXT PRIMARY KEY,
              payload_sha256 TEXT NOT NULL,
              status TEXT NOT NULL CHECK(status IN ('RUNNING','COMPLETE')),
              completed_at TEXT,
              started_at TEXT NOT NULL
            );
            """;
        cmd.ExecuteNonQuery();
    }
    private SqliteConnection Open()
    {
        var db = new SqliteConnection(_connection);
        db.Open();
        return db;
    }
    private static string Digest(WorkflowEvent ev) => Convert.ToHexString(
        SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(ev))));
    public InboxResult Reserve(WorkflowEvent ev)
    {
        lock (_gate)
        {
            using var db = Open();
            using var tx = db.BeginTransaction();
            using var select = db.CreateCommand();
            select.Transaction = tx;
            select.CommandText = "SELECT payload_sha256,status,started_at FROM receipts WHERE event_id=$id";
            select.Parameters.AddWithValue("$id", ev.EventId);
            using var reader = select.ExecuteReader();
            var digest = Digest(ev);
            if (reader.Read())
            {
                var oldDigest = reader.GetString(0);
                var status = reader.GetString(1);
                var startedAt = DateTimeOffset.Parse(reader.GetString(2));
                reader.Close();
                if (oldDigest != digest) return InboxResult.Conflict;
                if (status == "COMPLETE") return InboxResult.Completed;
                // RUNNING is leased for one minute. A failed host can be retried.
                // An activity must be idempotent because a crashed process might
                // have executed it just before the receipt was committed.
                if (DateTimeOffset.UtcNow - startedAt <= TimeSpan.FromMinutes(1))
                    return InboxResult.Busy;
                using var reset = db.CreateCommand();
                reset.Transaction = tx;
                reset.CommandText = "UPDATE receipts SET started_at=$now WHERE event_id=$id";
                reset.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
                reset.Parameters.AddWithValue("$id", ev.EventId);
                reset.ExecuteNonQuery();
                tx.Commit();
                return InboxResult.New;
            }
            reader.Close();
            using var insert = db.CreateCommand();
            insert.Transaction = tx;
            insert.CommandText = "INSERT INTO receipts(event_id,payload_sha256,status,started_at) VALUES($id,$digest,'RUNNING',$now)";
            insert.Parameters.AddWithValue("$id", ev.EventId);
            insert.Parameters.AddWithValue("$digest", digest);
            insert.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
            insert.ExecuteNonQuery();
            tx.Commit();
            return InboxResult.New;
        }
    }
    public void Complete(string id)
    {
        lock (_gate)
        {
            using var db = Open();
            using var cmd = db.CreateCommand();
            cmd.CommandText = "UPDATE receipts SET status='COMPLETE',completed_at=$now WHERE event_id=$id";
            cmd.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
            cmd.Parameters.AddWithValue("$id", id);
            cmd.ExecuteNonQuery();
        }
    }
    public void Release(string id)
    {
        lock (_gate)
        {
            using var db = Open();
            using var cmd = db.CreateCommand();
            cmd.CommandText = "DELETE FROM receipts WHERE event_id=$id AND status='RUNNING'";
            cmd.Parameters.AddWithValue("$id", id);
            cmd.ExecuteNonQuery();
        }
    }
}