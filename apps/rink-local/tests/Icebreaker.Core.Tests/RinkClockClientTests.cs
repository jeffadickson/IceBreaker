using System.Net;
using System.Text;
using Icebreaker.Core.Integration;
using Xunit;

namespace Icebreaker.Core.Tests;

public sealed class RinkClockClientTests
{
    private sealed class Handler : HttpMessageHandler
    {
        public readonly List<(string Path, string Body, string Key)> Requests = [];
        public bool Offline { get; set; }
        public int Seconds { get; set; } = 720;
        public bool Running { get; set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (Offline) throw new HttpRequestException("Authority unavailable");
            var path = request.RequestUri?.AbsolutePath ?? "";
            if (request.Method == HttpMethod.Get && path == "/api/games/demo/snapshot")
                return Json($"{{\"revision\":1,\"period\":2,\"seconds\":{Seconds},\"running\":{Running.ToString().ToLowerInvariant()},\"ended\":false,\"scores\":{{\"home\":2,\"away\":1}},\"clockMode\":\"STOP\",\"timingVersion\":\"10U-v2\",\"penalties\":{{}}}}");
            if (request.Method == HttpMethod.Post && path == "/api/operator/command")
            {
                var body = await (request.Content?.ReadAsStringAsync(cancellationToken) ?? Task.FromResult(""));
                var key = request.Headers.GetValues("Idempotency-Key").Single();
                Requests.Add((path, body, key));
                return Json("{\"revision\":2}");
            }
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }
        private static HttpResponseMessage Json(string body) => new(HttpStatusCode.OK)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
    }

    private static RinkClockClient Client(Handler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("http://127.0.0.1:8090") }, "test-key");

    [Fact]
    public async Task ReadsAuthoritySnapshot_NotALocalClock()
    {
        var h = new Handler();var c = Client(h);
        Assert.Equal("12:00", (await c.SnapshotAsync()).DisplayTime);
        h.Seconds = 599;
        Assert.Equal("09:59", (await c.SnapshotAsync()).DisplayTime);
    }

    [Fact]
    public async Task SpacebarAction_TogglesFromFreshSnapshot()
    {
        var h = new Handler();var c = Client(h);
        await c.ToggleAsync();
        Assert.Contains("\"START\"", h.Requests.Last().Body);
        h.Running = true;
        await c.ToggleAsync();
        Assert.Contains("\"STOP\"", h.Requests.Last().Body);
        Assert.NotEqual(h.Requests[0].Key, h.Requests[1].Key);
    }

    [Fact]
    public async Task Nudge_IsOneSecondAndRequiresStoppedClock()
    {
        var h = new Handler();var c = Client(h);
        await c.NudgeAsync(-1);
        Assert.Contains("\"seconds\":719", h.Requests.Single().Body);
        Assert.Contains("GAME_AND_PENALTIES", h.Requests.Single().Body);
        h.Running = true;
        await Assert.ThrowsAsync<InvalidOperationException>(() => c.NudgeAsync(1));
        Assert.Single(h.Requests);
        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => c.NudgeAsync(2));
    }

    [Fact]
    public async Task ManualCorrection_RequiresValidTimeAndReason()
    {
        var h = new Handler();var c = Client(h);
        await Assert.ThrowsAsync<ArgumentException>(() => c.SetClockAsync("99:90", "sync"));
        await Assert.ThrowsAsync<ArgumentException>(() => c.SetClockAsync("08:30", ""));
        await c.SetClockAsync("08:30", "Arena scoreboard sync");
        Assert.Contains("\"seconds\":510", h.Requests.Single().Body);
        Assert.Contains("GAME_ONLY", h.Requests.Single().Body);
    }

    [Fact]
    public async Task Disconnect_ThrowsAndNeverInventsAClockValue()
    {
        var h = new Handler { Offline = true };var c = Client(h);
        await Assert.ThrowsAsync<HttpRequestException>(() => c.SnapshotAsync());
        Assert.Empty(h.Requests);
    }
}
