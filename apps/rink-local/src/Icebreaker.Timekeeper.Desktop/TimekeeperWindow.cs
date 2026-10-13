using System.Net.Http;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using Icebreaker.Core.Integration;

namespace Icebreaker.Timekeeper.Desktop;

/// <summary>
/// The native UI is disposable. No local countdown or official state is kept
/// here: restarting this window always obtains a fresh authority snapshot.
/// </summary>
public sealed class TimekeeperWindow : Window
{
    private readonly HttpClient _http = new()
    {
        BaseAddress = new Uri(Environment.GetEnvironmentVariable("ICEBREAKER_RINK_URL") ?? "http://127.0.0.1:8090"),
        Timeout = TimeSpan.FromSeconds(2)
    };
    private readonly RinkClockClient _client;
    private readonly DispatcherTimer _poll;
    private readonly TextBlock _connection = Label("CONNECTING", 20);
    private readonly TextBlock _time = Label("--:--", 90);
    private readonly TextBlock _period = Label("Period —", 26);
    private readonly TextBlock _score = Label("— : —", 32);
    private readonly TextBlock _rules = Label("Rules unavailable", 14);
    private readonly TextBlock _penalties = Label("Penalties unavailable", 14);
    private readonly TextBlock _auxiliary = Label("Warmup / break —", 18);
    private readonly TextBlock _status = Label("Connecting to independent rink authority", 15);
    private readonly TextBox _setTime = new() { Watermark = "MM:SS", Width = 110 };
    private readonly TextBox _reason = new() { Watermark = "Reason for correction", Width = 250 };
    private readonly CheckBox _confirm = new() { Content = "Confirm clock correction" };
    private readonly List<Button> _mutations = [];
    private bool _busy;
    private bool _connected;
    private RinkClockSnapshot? _latest;

    public TimekeeperWindow()
    {
        Title = "IceBreaker — Native Timekeeper";
        Width = 950;
        Height = 760;
        MinWidth = 690;
        MinHeight = 570;
        var key = Environment.GetEnvironmentVariable("ICEBREAKER_OPERATOR_KEY") ?? "local-development-key";
        _client = new RinkClockClient(_http, key, Environment.GetEnvironmentVariable("ICEBREAKER_OPERATOR_ID") ?? "desktop-timekeeper");

        var body = new StackPanel { Spacing = 14, Margin = new Thickness(24) };
        body.Children.Add(Label("ICEBREAKER · RINK TIMEKEEPER", 27));
        body.Children.Add(_connection);
        body.Children.Add(_period);
        body.Children.Add(_time);
        body.Children.Add(_score);
        body.Children.Add(_rules);
        body.Children.Add(_penalties);
        body.Children.Add(Buttons(
            ActionButton("START / STOP   [SPACE]", () => _client.ToggleAsync(), 220),
            ActionButton("−1 SECOND", () => _client.NudgeAsync(-1)),
            ActionButton("+1 SECOND", () => _client.NudgeAsync(1))));
        body.Children.Add(new TextBlock { Text = "Clock synchronization (stopped clock only; reason and confirmation required)" });
        body.Children.Add(Buttons(_setTime, _reason, _confirm,
            ActionButton("SET CLOCK", async () =>
            {
                if (_confirm.IsChecked != true) throw new InvalidOperationException("Confirm the correction first");
                try { await _client.SetClockAsync(_setTime.Text ?? "", _reason.Text ?? ""); }
                finally { _confirm.IsChecked = false; }
            })));
        body.Children.Add(Buttons(
            ActionButton("END PERIOD", () => _client.CommandAsync(new { type = "PERIOD_ENDED" })),
            ActionButton("NEXT PERIOD", () => _client.CommandAsync(new { type = "PERIOD_ADVANCED" })),
            ActionButton("BEGIN OVERTIME", () => _client.CommandAsync(new { type = "OVERTIME_STARTED" }))));
        body.Children.Add(_auxiliary);
        body.Children.Add(Buttons(
            ActionButton("WARMUP", () => _client.AuxiliaryAsync("RESET", "WARMUP")),
            ActionButton("INTERMISSION", () => _client.AuxiliaryAsync("RESET", "INTERMISSION")),
            ActionButton("AUX START", () => _client.AuxiliaryAsync("START")),
            ActionButton("AUX PAUSE", () => _client.AuxiliaryAsync("PAUSE"))));
        body.Children.Add(_status);
        body.Children.Add(new TextBlock
        {
            Text = "Local authority is a separate process. Closing this window does not stop the game clock. " +
                   "If authority itself restarts, it recovers paused for operator review.",
            TextWrapping = TextWrapping.Wrap,
            Foreground = Brushes.LightGray
        });
        Content = new ScrollViewer { Content = body };
        KeyDown += OnKeyDown;
        _poll = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(400) };
        _poll.Tick += async (_, _) => await RefreshAsync();
        _poll.Start();
        Opened += async (_, _) => await RefreshAsync();
        Closed += (_, _) => { _poll.Stop(); _http.Dispose(); };
        SetEnabled(false);
    }

    private static TextBlock Label(string text, double size) => new()
    {
        Text = text, FontSize = size, FontWeight = FontWeight.Bold,
        TextWrapping = TextWrapping.Wrap
    };

    private static StackPanel Buttons(params Control[] controls)
    {
        var panel = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 9 };
        foreach (var control in controls) panel.Children.Add(control);
        return panel;
    }

    private Button ActionButton(string text, Func<Task> action, int width = 0)
    {
        var button = new Button
        {
            Content = text, MinHeight = 56,
            HorizontalContentAlignment = HorizontalAlignment.Center
        };
        if (width > 0) button.Width = width;
        button.Click += async (_, _) => await ExecuteAsync(action);
        _mutations.Add(button);
        return button;
    }

    private async Task ExecuteAsync(Func<Task> action)
    {
        if (_busy || !_connected) return;
        _busy = true;
        SetEnabled(false);
        try
        {
            await action();
            _status.Text = "Command accepted by rink authority";
        }
        catch (Exception ex)
        {
            _status.Text = ex.Message;
        }
        finally
        {
            _busy = false;
            await RefreshAsync();
        }
    }

    private async void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key != Key.Space || e.Source is TextBox || e.Source is Button || e.Source is CheckBox) return;
        e.Handled = true;
        await ExecuteAsync(() => _client.ToggleAsync());
    }

    private void SetEnabled(bool value)
    {
        foreach (var button in _mutations) button.IsEnabled = value;
    }

    private async Task RefreshAsync()
    {
        if (_busy) return;
        _busy = true;
        try
        {
            var snapshot = await _client.SnapshotAsync();
            _latest = snapshot;
            _connected = true;
            _connection.Text = snapshot.Running ? "● AUTHORITY CONNECTED · RUNNING" : "● AUTHORITY CONNECTED · STOPPED";
            _connection.Foreground = Brushes.LightGreen;
            _time.Text = snapshot.DisplayTime;
            _period.Text = snapshot.Period.ToString();
            _score.Text = $"HOME {snapshot.Home}  —  {snapshot.Away} AWAY";
            _rules.Text = $"Clock mode {snapshot.ClockMode} · Rules {snapshot.TimingVersion} · Revision {snapshot.Revision}";
            _penalties.Text = "Penalty state: " + snapshot.PenaltiesJson;
            try
            {
                var aux = await _client.AuxiliarySnapshotAsync();
                _auxiliary.Text = $"{aux.Phase}: {aux.Seconds / 60:00}:{aux.Seconds % 60:00} {(aux.Running ? "RUNNING" : "STOPPED")}";
            }
            catch { _auxiliary.Text = "Auxiliary clock unavailable"; }
        }
        catch (Exception ex)
        {
            _connected = false;
            _latest = null;
            _connection.Text = "● DISCONNECTED — OFFICIAL CLOCK STATUS UNKNOWN";
            _connection.Foreground = Brushes.OrangeRed;
            _time.Text = "--:--";
            _status.Text = "Rink authority unavailable: " + ex.Message;
        }
        finally
        {
            _busy = false;
            SetEnabled(_connected && _latest?.Ended != true);
        }
    }
}
