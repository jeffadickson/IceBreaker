using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Elsa.Extensions;
using Elsa.Workflows;
using Elsa.Workflows.Activities;
using Elsa.Workflows.Contracts;

// Elsa executes workflow orchestration. IceBreaker's authoritative SQLite event
// journal, role checks, signatures and certification invariants remain upstream.
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddElsa();
builder.Services.AddSingleton<WorkflowEventLedger>();
var app = builder.Build();
var bridgeSecret = app.Configuration["ICEBREAKER_ELSA_BRIDGE_KEY"];
if (string.IsNullOrWhiteSpace(bridgeSecret) || bridgeSecret.Length < 32)
    throw new InvalidOperationException("Set a random ICEBREAKER_ELSA_BRIDGE_KEY of at least 32 characters");

app.MapGet("/healthz", () => Results.Ok(new { status = "ok", workflowEngine = "Elsa 3.8" }));
app.MapPost("/api/icebreaker/workflow-events", async (HttpRequest request, IWorkflowRunner runner, WorkflowEventLedger ledger) =>
{
    // Only the trusted local workflow publisher may call this endpoint.
    var provided = request.Headers["X-IceBreaker-Workflow-Key"].ToString();
    if (!FixedEquals(provided, bridgeSecret)) return Results.Unauthorized();
    WorkflowEvent? message;
    try { message = await request.ReadFromJsonAsync<WorkflowEvent>(); }
    catch (JsonException) { return Results.BadRequest("Invalid JSON envelope"); }
    if (message == null || string.IsNullOrWhiteSpace(message.EventId) ||
        string.IsNullOrWhiteSpace(message.GameId) || string.IsNullOrWhiteSpace(message.Action) ||
        string.IsNullOrWhiteSpace(message.DefinitionDigest) || message.Revision < 0)
        return Results.BadRequest("Incomplete workflow envelope");
    // Event ID is stable across retry, ensuring at-most-once Elsa dispatch per
    // running host. Production requires persisted inbox and durable Elsa runtime.
    if (!ledger.TryAcquire(message.EventId)) return Results.Ok(new { accepted = true, duplicate = true });
    try
    {
        var workflow = new Sequence
        {
            Activities =
            {
                new WriteLine($"IceBreaker workflow game={message.GameId} action={message.Action} revision={message.Revision} id={message.EventId}")
            }
        };
        await runner.RunAsync(workflow);
        return Results.Accepted($"/api/icebreaker/workflow-events/{Uri.EscapeDataString(message.EventId)}", new { accepted = true, duplicate = false });
    }
    catch
    {
        ledger.Release(message.EventId);
        throw;
    }
});
app.Run();

static bool FixedEquals(string supplied, string expected)
{
    var a = SHA256.HashData(Encoding.UTF8.GetBytes(supplied));
    var b = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
    return CryptographicOperations.FixedTimeEquals(a, b) && supplied.Length == expected.Length;
}
public record WorkflowEvent(string EventId, string GameId, string Action, long Revision, string DefinitionDigest, string? State);
public sealed class WorkflowEventLedger
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, byte> _seen = new();
    public bool TryAcquire(string id) => _seen.TryAdd(id, 1);
    public void Release(string id) => _seen.TryRemove(id, out _);
}