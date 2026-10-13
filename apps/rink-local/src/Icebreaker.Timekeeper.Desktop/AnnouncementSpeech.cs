using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Speech.Synthesis;
using NAudio.Wave;

namespace Icebreaker.Timekeeper.Desktop;

/// <summary>
/// Explicitly invoked PA speech. Neither synthesis nor playback touches the
/// game clock or journal. Hosted speech is opt-in; offline speech is default.
/// </summary>
public sealed class AnnouncementSpeech(HttpClient http)
{
    public const string DefaultInstructions =
        "You are a professional ice hockey arena public-address announcer. " +
        "Speak clearly, with energetic but controlled delivery. No additional words.";

    public async Task<byte[]> SynthesizeAsync(
        string script, bool useAi, string voice = "onyx",
        string? instructions = null, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(script) || script.Length > 600 ||
            script.Any(char.IsControl))
            throw new ArgumentException("Announcement must be 1–600 printable characters", nameof(script));

        if (!useAi)
        {
            if (!OperatingSystem.IsWindows())
                throw new PlatformNotSupportedException("Offline speech requires Windows.");
            using var synth = new SpeechSynthesizer();
            using var stream = new MemoryStream();
            synth.SetOutputToWaveStream(stream);
            synth.Speak(script);
            return stream.ToArray();
        }

        if (!new[] { "alloy", "ash", "ballad", "coral", "echo", "fable", "onyx",
                     "nova", "sage", "shimmer", "verse", "marin", "cedar" }.Contains(voice))
            throw new ArgumentException("Unsupported AI voice", nameof(voice));
        if (instructions is { Length: > 300 } || instructions?.Any(char.IsControl) == true)
            throw new ArgumentException("Voice instructions must be printable and at most 300 characters", nameof(instructions));

        // The key stays on the laptop and is never sent to the rink backend.
        var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("Set OPENAI_API_KEY to enable the optional AI voice.");

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/audio/speech")
        {
            Content = JsonContent.Create(new
            {
                model = "gpt-4o-mini-tts",
                voice,
                input = script,
                instructions = string.IsNullOrWhiteSpace(instructions) ? DefaultInstructions : instructions,
                response_format = "wav"
            })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"AI speech provider returned HTTP {(int)response.StatusCode}. Select offline voice or retry.");
        var data = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        if (data.Length < 44 || data.Length > 8_000_000 ||
            data[0] != 'R' || data[1] != 'I' || data[2] != 'F' || data[3] != 'F')
            throw new InvalidOperationException("Speech provider returned invalid WAV audio.");
        return data;
    }

    /// <summary>Plays a WAV on the laptop's default Windows output device.</summary>
    public static async Task PlayWavAsync(byte[] wav, CancellationToken cancellationToken = default)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("PA playback currently requires Windows.");
        using var memory = new MemoryStream(wav, writable: false);
        using var reader = new WaveFileReader(memory);
        using var output = new WaveOutEvent();
        var finished = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        output.PlaybackStopped += (_, args) =>
        {
            if (args.Exception is { } error) finished.TrySetException(error);
            else finished.TrySetResult();
        };
        output.Init(reader);
        output.Play();
        using var cancel = cancellationToken.Register(() => { output.Stop(); finished.TrySetCanceled(cancellationToken); });
        await finished.Task;
    }
}
