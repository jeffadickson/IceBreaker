using Avalonia;
using Icebreaker.Core.Integration;
using OpenTelemetry;
using OpenTelemetry.Exporter;
using OpenTelemetry.Trace;

namespace Icebreaker.Timekeeper.Desktop;

internal static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        // Explicitly opt-in. No auto HTTP instrumentation, player attributes,
        // raw URLs, credentials, or document payloads are exported.
        using var provider = CreateTelemetry();
        AppBuilder.Configure<App>().UsePlatformDetect().LogToTrace()
            .StartWithClassicDesktopLifetime(args);
    }

    private static TracerProvider? CreateTelemetry()
    {
        if (Environment.GetEnvironmentVariable("ICEBREAKER_OTEL_ENABLED") != "1")
            return null;
        var endpoint = Environment.GetEnvironmentVariable("ICEBREAKER_OTEL_DOTNET_ENDPOINT")
            ?? "http://127.0.0.1:4318";
        var uri = new Uri(endpoint, UriKind.Absolute);
        if ((uri.Scheme != "http" && uri.Scheme != "https") ||
            (uri.Host != "localhost" && uri.Host != "127.0.0.1" && uri.Host != "::1") ||
            !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment))
            throw new InvalidOperationException("Desktop telemetry must use a local OpenTelemetry Collector");
        return Sdk.CreateTracerProviderBuilder()
            .AddSource(RinkClockClient.Telemetry.Name)
            .AddOtlpExporter(options =>
            {
                options.Endpoint = uri;
                options.Protocol = OtlpExportProtocol.HttpProtobuf;
            })
            .Build();
    }
}
