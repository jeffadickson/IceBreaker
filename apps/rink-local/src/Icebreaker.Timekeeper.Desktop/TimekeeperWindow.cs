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
    private readonly ListBox _eventHistory = new() { MinHeight = 230 };
    private readonly ComboBox _goalTeam = new() { ItemsSource = new[] { "home", "away" }, SelectedIndex = 0, Width = 120 };
    private readonly TextBox _goalScorer = new() { Watermark = "Scorer jersey #", Width = 145 };
    private readonly TextBox _goalAssist1 = new() { Watermark = "Assist 1 or NONE", Text = "NONE", Width = 160 };
    private readonly TextBox _goalAssist2 = new() { Watermark = "Assist 2 or NONE", Text = "NONE", Width = 160 };
    private readonly CheckBox _goalConfirm = new() { Content = "I verified the scoring team and players" };
    private readonly ComboBox _goalieTeam = new() { ItemsSource = new[] { "home", "away" }, SelectedIndex = 0, Width = 120 };
    private readonly TextBox _goalieNumber = new() { Watermark = "Goalie jersey or EMPTY", Width = 190 };
    private readonly TextBox _goalieReason = new() { Watermark = "Reason for goalie change", Width = 240 };
    private readonly TextBlock _status = Label("Connecting to independent rink authority", 15);
    private readonly TextBlock _recent = Label("Waiting for committed events", 14);
    private readonly ComboBox _correctionGoal = new() { MinWidth = 440 };
    private readonly TextBox _correctScorer = new() { Watermark = "Correct scorer jersey", Width = 150 };
    private readonly TextBox _correctAssist1 = new() { Watermark = "Assist 1 or NONE", Text = "NONE", Width = 160 };
    private readonly TextBox _correctAssist2 = new() { Watermark = "Assist 2 or NONE", Text = "NONE", Width = 160 };
    private readonly TextBox _correctReason = new() { Watermark = "Why is this correction necessary?", Width = 360 };
    private readonly Dictionary<TextBox, ComboBox> _rosterSelectors = new();
    private Window? _activeDialog;
    private readonly TextBox _penaltyTeam = new() { Watermark = "home / away", Width = 130 };
    private readonly TextBox _penaltyPlayer = new() { Watermark = "Jersey #", Width = 95 };
    private readonly TextBox _penaltyInfraction = new() { Watermark = "Infraction", Width = 180 };
    private readonly ComboBox _penaltyClass = new() { ItemsSource = new[] { "MINOR", "DOUBLE_MINOR", "MAJOR", "MISCONDUCT", "GAME_MISCONDUCT", "MATCH", "OTHER" }, SelectedIndex = 0, Width = 185 };\n    private readonly CheckBox _penaltyCoincidental = new() { Content = "Coincidental penalty" };\n    private readonly TextBox _penaltySeconds = new() { Watermark = "Seconds", Text = "120", Width = 100 };
    private readonly TextBox _setTime = new() { Watermark = "MM:SS", Width = 110 };
    private readonly TextBox _reason = new() { Watermark = "Reason for correction", Width = 250 };
    private readonly CheckBox _confirm = new() { Content = "Confirm clock correction" };
    private readonly List<Button> _mutations = [];
    private readonly AnnouncementQueue _paQueue = new(
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "IceBreaker", "desktop-pa.sqlite"));
    private readonly AnnouncementSpeech _speech = new(new HttpClient { Timeout = TimeSpan.FromSeconds(25) });
    private readonly ListBox _announcements = new() { Height = 140, Width = 850 };
    private readonly ComboBox _voiceMode = new() { ItemsSource = new[] { "Offline Windows voice", "AI arena announcer (cloud)" }, SelectedIndex = 0, Width = 245 };
    private readonly ComboBox _aiVoice = new() { ItemsSource = new[] { "onyx", "marin", "cedar", "echo", "alloy", "nova" }, SelectedIndex = 0, Width = 115 };
    private readonly ComboBox _paStyle = new() { ItemsSource = new[] { "Classic arena PA", "High-energy goal call", "Calm and precise" }, SelectedIndex = 0, Width = 205 };
    private readonly TextBlock _paStatus = Label("PA is manual-approval only; AI speech is synthetic.", 14);
    private readonly HashSet<string> _seenPaEvents = new(StringComparer.Ordinal);
    private bool _paInitialized;
    private bool _paBusy;
    private bool _busy;
    private bool _connected;
    private RinkClockSnapshot? _latest;

    public TimekeeperWindow()
    {
        Title = "IceBreaker — Native Timekeeper";
        Width = 1180;
        Height = 790;
        MinWidth = 760;
        MinHeight = 590;
        var key = Environment.GetEnvironmentVariable("ICEBREAKER_OPERATOR_KEY") ?? "local-development-key";
        _client = new RinkClockClient(_http, key, Environment.GetEnvironmentVariable("ICEBREAKER_OPERATOR_ID") ?? "desktop-timekeeper");

        // Main-screen-first workflow: scoreboard remains visible behind modal
        // entry windows. The backend alone owns official clock and score.
        Background = new SolidColorBrush(Color.Parse("#071321"));
        var clockBody = new StackPanel { Spacing = 15, Margin = new Thickness(18) };
        clockBody.Children.Add(Label("CLOCK OPERATIONS", 19));
        clockBody.Children.Add(_rules);
        clockBody.Children.Add(_penalties);
        clockBody.Children.Add(Buttons(
            ActionButton("START / STOP   [SPACE]", () => _client.ToggleAsync(), 230),
            ActionButton("−1 SECOND", () => _client.NudgeAsync(-1)),
            ActionButton("+1 SECOND", () => _client.NudgeAsync(1))));
        clockBody.Children.Add(new TextBlock { Text = "Clock correction — stopped clock only; a reason and confirmation are required" });
        clockBody.Children.Add(Buttons(_setTime, _reason, _confirm,
            ActionButton("SET ARENA TIME", async () =>
            {
                if (_confirm.IsChecked != true) throw new InvalidOperationException("Confirm the correction first");
                try { await _client.SetClockAsync(_setTime.Text ?? "", _reason.Text ?? ""); }
                finally { _confirm.IsChecked = false; }
            })));
        clockBody.Children.Add(Buttons(
            ActionButton("END PERIOD", () => _client.CommandAsync(new { type = "PERIOD_ENDED" })),
            ActionButton("NEXT PERIOD", () => _client.CommandAsync(new { type = "PERIOD_ADVANCED" })),
            ActionButton("OVERTIME", () => _client.CommandAsync(new { type = "OVERTIME_STARTED" }))));
        clockBody.Children.Add(Label("WARMUP · INTERMISSION · TIMEOUT", 18));
        clockBody.Children.Add(_auxiliary);
        clockBody.Children.Add(Buttons(
            ActionButton("WARMUP", () => _client.AuxiliaryAsync("RESET", "WARMUP")),
            ActionButton("INTERMISSION", () => _client.AuxiliaryAsync("RESET", "INTERMISSION")),
            ActionButton("AUX START", () => _client.AuxiliaryAsync("START")),
            ActionButton("AUX PAUSE", () => _client.AuxiliaryAsync("PAUSE"))));
        clockBody.Children.Add(Buttons(
            ActionButton("HOME TIMEOUT", () => _client.CommandAsync(new { type = "TIMEOUT_TAKEN", team = "home" })),
            ActionButton("AWAY TIMEOUT", () => _client.CommandAsync(new { type = "TIMEOUT_TAKEN", team = "away" }))));

        var goalBody = new StackPanel { Spacing = 15, Margin = new Thickness(18) };
        goalBody.Children.Add(Label("GOAL · OFFICIAL JOURNAL ENTRY", 19));
        goalBody.Children.Add(new TextBlock
        {
            Text = "Use jersey numbers from the approved game lineup. NONE means no assist. The server validates the event before committing it.",
            TextWrapping = TextWrapping.Wrap
        });
        goalBody.Children.Add(Buttons(_goalTeam, PlayerPicker(_goalScorer, "Scorer"), PlayerPicker(_goalAssist1, "Assist 1"), PlayerPicker(_goalAssist2, "Assist 2")));
        goalBody.Children.Add(_goalConfirm);
        goalBody.Children.Add(ActionButton("RECORD GOAL", async () =>
        {
            if (_goalConfirm.IsChecked != true) throw new InvalidOperationException("Verify goal details before committing");
            var scorer = RequiredJersey(_goalScorer.Text);
            var assist1 = OptionalJersey(_goalAssist1.Text);
            var assist2 = OptionalJersey(_goalAssist2.Text);
            if (scorer == assist1 || scorer == assist2 || (assist1 != "NONE" && assist1 == assist2))
                throw new InvalidOperationException("Scorer and assists must be different players");
            await _client.CommandAsync(new
            {
                type = "GOAL_RECORDED", team = _goalTeam.SelectedItem?.ToString() ?? "home",
                scorer, assist1, assist2
            });
            _goalConfirm.IsChecked = false;
            _goalScorer.Text = "";
            _goalAssist1.Text = "NONE";
            _goalAssist2.Text = "NONE";
        }, closeOnSuccess: true));
        var penaltyBody = new StackPanel { Spacing = 15, Margin = new Thickness(18) };
        penaltyBody.Children.Add(Label("PENALTY ENTRY", 18));
        penaltyBody.Children.Add(Buttons(_penaltyTeam, PlayerPicker(_penaltyPlayer, "Penalty player"), _penaltyInfraction, _penaltyClass, _penaltyCoincidental, _penaltySeconds,
            ActionButton("ASSESS PENALTY", async () =>
            {
                if (!int.TryParse(_penaltySeconds.Text, out var seconds) || seconds < 1 || seconds > 3600)
                    throw new InvalidOperationException("Penalty duration must be 1–3600 seconds");
                var team = (_penaltyTeam.Text ?? "").Trim().ToLowerInvariant();
                if (team is not ("home" or "away"))
                    throw new InvalidOperationException("Select HOME or AWAY for the penalty");
                var player = RequiredJersey(_penaltyPlayer.Text);
                var infraction = (_penaltyInfraction.Text ?? "").Trim();
                if (string.IsNullOrWhiteSpace(infraction))
                    throw new InvalidOperationException("Select or enter a penalty infraction");
                await _client.CommandAsync(new
                {
                    type = "PENALTY_ASSESSED", team,
                    player, infraction, duration = seconds,
                    classification = _penaltyClass.SelectedItem?.ToString() ?? "MINOR",\n                    coincidental = _penaltyCoincidental.IsChecked == true
                });
                _penaltyPlayer.Text = "";
                _penaltyInfraction.Text = "";
                _penaltySeconds.Text = "120";\n                _penaltyClass.SelectedIndex = 0;\n                _penaltyCoincidental.IsChecked = false;
            }, closeOnSuccess: true)));
        var goalieBody = new StackPanel { Spacing = 15, Margin = new Thickness(18) };
        goalieBody.Children.Add(Label("GOALIE CHANGE", 18));
        goalieBody.Children.Add(new TextBlock
        {
            Text = "Record a goalie substitution or enter EMPTY for a pulled goalie. This does not modify the approved roster.",
            TextWrapping = TextWrapping.Wrap
        });
        goalieBody.Children.Add(Buttons(_goalieTeam, PlayerPicker(_goalieNumber, "Goalie"), _goalieReason,
            ActionButton("RECORD GOALIE CHANGE", async () =>
            {
                var jersey = (_goalieNumber.Text ?? "").Trim().ToUpperInvariant();
                if (jersey != "EMPTY") jersey = RequiredJersey(jersey);
                if (string.IsNullOrWhiteSpace(_goalieReason.Text))
                    throw new InvalidOperationException("Goalie change reason required");
                await _client.CommandAsync(new
                {
                    type = "GOALIE_CHANGED", team = _goalieTeam.SelectedItem?.ToString() ?? "home",
                    player = jersey == "EMPTY" ? null : jersey, reason = _goalieReason.Text.Trim()
                });
                _goalieNumber.Text = "";
                _goalieReason.Text = "";
            }, closeOnSuccess: true)));

        var correctionBody = new StackPanel { Spacing = 15, Margin = new Thickness(18) };
        correctionBody.Children.Add(Label("AUDITED GOAL ATTRIBUTION CORRECTION", 19));
        correctionBody.Children.Add(new TextBlock
        {
            Text = "Select the original committed goal. This appends a new correction event; the original remains in the journal. A correction reason is mandatory. Goal voiding and penalty reversals are not available here.",
            TextWrapping = TextWrapping.Wrap
        });
        _correctionGoal.SelectionChanged += (_, _) =>
        {
            if (_correctionGoal.SelectedItem is not GoalChoice selected) return;
            _correctScorer.Text = selected.Scorer;
            _correctAssist1.Text = selected.Assist1;
            _correctAssist2.Text = selected.Assist2;
        };
        correctionBody.Children.Add(_correctionGoal);
        correctionBody.Children.Add(Buttons(PlayerPicker(_correctScorer, "Correct scorer"), PlayerPicker(_correctAssist1, "Correct assist 1"), PlayerPicker(_correctAssist2, "Correct assist 2")));
        correctionBody.Children.Add(_correctReason);
        correctionBody.Children.Add(ActionButton("SUBMIT AUDITED CORRECTION", async () =>
        {
            if (_correctionGoal.SelectedItem is not GoalChoice goal)
                throw new InvalidOperationException("Select the original goal event");
            var scorer = RequiredJersey(_correctScorer.Text);
            var assist1 = OptionalJersey(_correctAssist1.Text);
            var assist2 = OptionalJersey(_correctAssist2.Text);
            if (scorer == assist1 || scorer == assist2 || (assist1 != "NONE" && assist1 == assist2))
                throw new InvalidOperationException("Scorer and assists must be different players");
            if (string.IsNullOrWhiteSpace(_correctReason.Text))
                throw new InvalidOperationException("A correction reason is required");
            await _client.CommandAsync(new
            {
                type = "GOAL_ATTRIBUTION_CORRECTED", originalEventId = goal.Id,
                scorer, assist1, assist2, reason = _correctReason.Text.Trim()
            });
            _correctReason.Text = "";
        }, closeOnSuccess: true));

        var eventsBody = new StackPanel { Spacing = 12, Margin = new Thickness(18) };
        eventsBody.Children.Add(Label("COMMITTED EVENT HISTORY", 19));
        eventsBody.Children.Add(new TextBlock { Text = "Read-only events from the rink authority; drafts do not appear here." });
        eventsBody.Children.Add(_eventHistory);

        var paBody = new StackPanel { Spacing = 13, Margin = new Thickness(18) };
        paBody.Children.Add(Label("PUBLIC ADDRESS · MANUAL APPROVAL", 18));
        paBody.Children.Add(new TextBlock
        {
            Text = "AI speech is synthetic and optional. Only committed event scripts using jersey numbers are sent to the provider.",
            TextWrapping = TextWrapping.Wrap
        });
        paBody.Children.Add(Buttons(_voiceMode, _aiVoice, _paStyle));
        paBody.Children.Add(_announcements);
        paBody.Children.Add(Buttons(
            PaButton("PREVIEW / PLAY SELECTED", PlaySelectedAsync),
            PaButton("SKIP SELECTED", SkipSelectedAsync)));
        paBody.Children.Add(_paStatus);

        // The two team buttons open a preselected draft with one click.
        // Draft fields can be changed or dismissed without journal mutations.
        var dashboard = new StackPanel { Spacing = 14, Margin = new Thickness(20, 10) };
        dashboard.Children.Add(Label("QUICK GAME ACTIONS", 19));
        dashboard.Children.Add(Buttons(
            PopupButton("HOME GOAL", "Home goal", goalBody, () => _goalTeam.SelectedIndex = 0, 220),
            PopupButton("AWAY GOAL", "Away goal", goalBody, () => _goalTeam.SelectedIndex = 1, 220)));
        dashboard.Children.Add(Buttons(
            PopupButton("HOME PENALTY", "Home penalty", penaltyBody, () => _penaltyTeam.Text = "home", 220),
            PopupButton("AWAY PENALTY", "Away penalty", penaltyBody, () => _penaltyTeam.Text = "away", 220)));
        dashboard.Children.Add(Buttons(
            PopupButton("HOME GOALIE", "Home goalie change", goalieBody, () => _goalieTeam.SelectedIndex = 0, 220),
            PopupButton("AWAY GOALIE", "Away goalie change", goalieBody, () => _goalieTeam.SelectedIndex = 1, 220)));
        dashboard.Children.Add(Label("OFFICIAL CLOCK", 18));
        dashboard.Children.Add(Buttons(
            ActionButton("START / STOP   [SPACE]", () => _client.ToggleAsync(), 240),
            PopupButton("CLOCK / PERIOD CONTROLS", "Clock and period controls", clockBody, width: 260)));
        dashboard.Children.Add(Label("LIVE PENALTIES", 18));
        dashboard.Children.Add(_penalties);
        dashboard.Children.Add(Label("RECENT COMMITTED EVENT", 18));
        dashboard.Children.Add(_recent);
        dashboard.Children.Add(Buttons(
            PopupButton("CORRECT GOAL", "Audited goal correction", correctionBody, PopulateGoalCorrections, 220),
            PopupButton("EVENT HISTORY", "Committed event history", eventsBody, width: 220),
            PopupButton("ARENA ANNOUNCER", "Arena announcements", paBody, width: 220)));
        dashboard.Children.Add(new TextBlock
        {
            Text = "Before submit: edit or cancel the popup freely. After submit: corrections are logged against the original event. Goal-attribution correction is supported; penalty/score reversal remains restricted until the authority implements it.",
            TextWrapping = TextWrapping.Wrap,
            Foreground = Brushes.LightGray
        });
        var scoreboard = new StackPanel
        {
            Spacing = 4,
            Margin = new Thickness(20, 15),
            HorizontalAlignment = HorizontalAlignment.Center
        };
        scoreboard.Children.Add(Label("ICEBREAKER · RINK CONTROL", 17));
        scoreboard.Children.Add(_connection);
        scoreboard.Children.Add(_period);
        scoreboard.Children.Add(_time);
        scoreboard.Children.Add(_score);
        _time.HorizontalAlignment = HorizontalAlignment.Center;
        _time.Foreground = Brushes.White;
        _score.HorizontalAlignment = HorizontalAlignment.Center;
        var header = new Border
        {
            Background = new SolidColorBrush(Color.Parse("#12324C")),
            CornerRadius = new CornerRadius(15),
            Margin = new Thickness(14, 12, 14, 6),
            Child = scoreboard
        };
        var footer = new Border
        {
            Background = new SolidColorBrush(Color.Parse("#112A40")),
            Padding = new Thickness(16, 9),
            Child = _status
        };
        var shell = new DockPanel { LastChildFill = true };
        DockPanel.SetDock(header, Dock.Top);
        DockPanel.SetDock(footer, Dock.Bottom);
        shell.Children.Add(header);
        shell.Children.Add(footer);
        shell.Children.Add(new ScrollViewer { Content = dashboard });
        Content = shell;
        KeyDown += OnKeyDown;
        _poll = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(400) };
        _poll.Tick += async (_, _) => await RefreshAsync();
        _poll.Start();
        Opened += async (_, _) => await RefreshAsync();
        Closed += (_, _) => { _poll.Stop(); _http.Dispose(); _paQueue.Dispose(); };
        SetEnabled(false);
    }

    private static string RequiredJersey(string? value)
    {
        var raw = (value ?? "").Trim();
        if (!System.Text.RegularExpressions.Regex.IsMatch(raw, @"^\d{1,3}$"))
            throw new InvalidOperationException("Enter a valid jersey number");
        return int.Parse(raw).ToString();
    }

    private static string OptionalJersey(string? value)
    {
        var raw = (value ?? "").Trim().ToUpperInvariant();
        return raw is "" or "NONE" ? "NONE" : RequiredJersey(raw);
    }

    private static TextBlock Label(string text, double size) => new()
    {
        Text = text, FontSize = size, FontWeight = FontWeight.Bold,
        TextWrapping = TextWrapping.Wrap
    };

    private static WrapPanel Buttons(params Control[] controls)
    {
        // A rink laptop may be 1366x768. Wrap controls rather than clipping
        // right-side actions when the window is resized or touch-scaled.
        var panel = new WrapPanel { Orientation = Orientation.Horizontal };
        foreach (var control in controls)
        {
            control.Margin = new Thickness(0, 0, 10, 10);
            panel.Children.Add(control);
        }
        return panel;
    }

    private sealed record GoalChoice(string Id, string Description, string Scorer, string Assist1, string Assist2)
    {
        public override string ToString() => Description;
    }

    private static string EventDetail(RinkEvent ev, string key)
    {
        using var json = System.Text.Json.JsonDocument.Parse(ev.DetailsJson);
        return json.RootElement.TryGetProperty(key, out var field) && field.ValueKind == System.Text.Json.JsonValueKind.String
            ? field.GetString() ?? "NONE" : "NONE";
    }

    private void PopulateGoalCorrections()
    {
        var events = _latest?.Events ?? [];
        var corrections = events.Where(ev => ev.Type == "GOAL_ATTRIBUTION_CORRECTED").ToArray();
        var choices = events.Where(ev => ev.Type == "GOAL_RECORDED")
            .Reverse().Take(30)
            .Select(goal =>
            {
                // Prefill from the most recent correction, if one exists.
                var latest = corrections.LastOrDefault(ev => EventDetail(ev, "originalEventId") == goal.Id) ?? goal;
                return new GoalChoice(goal.Id,
                    $"{(goal.Team ?? "game").ToUpperInvariant()} · {latest.DetailsJson}",
                    EventDetail(latest, "scorer"), EventDetail(latest, "assist1"), EventDetail(latest, "assist2"));
            }).ToArray();
        _correctionGoal.ItemsSource = choices;
        _correctionGoal.SelectedIndex = choices.Length > 0 ? 0 : -1;
    }

    private Control PlayerPicker(TextBox target, string title)
    {
        var choices = new ComboBox { Width = 190, MinHeight = 42 };
        choices.SelectionChanged += (_, _) =>
        {
            if (choices.SelectedItem is RosterChoice selected)
                target.Text = selected.Jersey;
        };
        _rosterSelectors[target] = choices;
        return new StackPanel
        {
            Spacing = 3,
            Children =
            {
                new TextBlock { Text = title, FontSize = 13 },
                choices,
                target,
                new TextBlock { Text = "Choose a confirmed player or type a jersey", FontSize = 11 }
            }
        };
    }

    private sealed record RosterChoice(string Jersey, string Display)
    {
        public override string ToString() => Display;
    }

    private void ApplyRosterChoices(string side, System.Text.Json.JsonElement players)
    {
        var choices = players.EnumerateArray()
            .Select(p => new RosterChoice(p.GetProperty("jersey").ToString(),
                "#" + p.GetProperty("jersey").ToString() + " · " +
                (p.TryGetProperty("name", out var name) ? name.GetString() : "Player")))
            .ToArray();
        var targets = new[] { _goalScorer, _goalAssist1, _goalAssist2, _goalieNumber, _penaltyPlayer,
            _correctScorer, _correctAssist1, _correctAssist2 };
        foreach (var target in targets)
        {
            if (!_rosterSelectors.TryGetValue(target, out var selector)) continue;
            var special = target == _goalieNumber ? new[] { new RosterChoice("EMPTY", "EMPTY · pulled goalie") }
                : target == _goalAssist1 || target == _goalAssist2 || target == _correctAssist1 || target == _correctAssist2
                    ? new[] { new RosterChoice("NONE", "NONE · unassisted") }
                    : Array.Empty<RosterChoice>();
            selector.ItemsSource = special.Concat(choices).ToArray();
            selector.SelectedIndex = -1;
        }
    }

    // Populate selector suggestions from the confirmed, eligible game-day roster.
    // Text remains editable for rapid keyboard entry; authority validates every command.
    private async Task LoadRosterSuggestionsAsync(string side)
    {
        try
        {
            using var roster = await _client.GameRostersAsync();
            var root = roster.RootElement;
            if (!root.GetProperty("confirmed").GetBoolean())
            {
                _status.Text = "Game-day rosters are not fully confirmed; scoring may be rejected.";
                return;
            }
            var team = root.GetProperty("teams").GetProperty(side);
            if (!team.GetProperty("confirmed").GetBoolean() || !team.GetProperty("eligible").GetBoolean())
                throw new InvalidOperationException("Selected team's lineup is not eligible");
            ApplyRosterChoices(side, team.GetProperty("players"));\n            var jerseys = team.GetProperty("players").EnumerateArray()
                .Select(p => p.GetProperty("jersey").ToString()).Distinct().ToArray();
            _status.Text = side.ToUpperInvariant() + " approved jerseys: " + string.Join(", ", jerseys);
        }
        catch (Exception ex)
        {
            _status.Text = "Roster unavailable: " + ex.Message;
        }
    }

    private Button PopupButton(string text, string title, Control panel, Action? beforeOpen = null, int width = 0)
    {
        var button = new Button { Content = text, MinHeight = 62, FontWeight = FontWeight.Bold };
        if (width > 0) button.Width = width;
        button.Click += async (_, _) =>
        {
            if (_activeDialog is not null || !_connected || _busy) return;
            beforeOpen?.Invoke();
            await ShowPanelAsync(title, panel);
        };
        _mutations.Add(button);
        return button;
    }

    private async Task ShowPanelAsync(string title, Control panel)
    {
        var scroller = new ScrollViewer { Content = panel };
        var dismiss = new Button { Content = "CANCEL / CLOSE", MinHeight = 48 };
        var layout = new DockPanel { LastChildFill = true };
        DockPanel.SetDock(dismiss, Dock.Bottom);
        layout.Children.Add(dismiss);
        layout.Children.Add(scroller);
        var dialog = new Window
        {
            Title = title,
            Width = 750,
            Height = 570,
            MinWidth = 500,
            MinHeight = 400,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Background = new SolidColorBrush(Color.Parse("#0C2235")),
            Content = layout
        };
        dismiss.Click += (_, _) => dialog.Close();
        _activeDialog = dialog;
        try { await dialog.ShowDialog(this); }
        finally
        {
            // A panel is reused in subsequent popups; it must not remain
            // attached to a closed window's visual tree.
            scroller.Content = null;
            _activeDialog = null;
        }
    }

    private Button ActionButton(string text, Func<Task> action, int width = 0, bool closeOnSuccess = false)
    {
        var button = new Button
        {
            Content = text, MinHeight = 56,
            HorizontalContentAlignment = HorizontalAlignment.Center
        };
        if (width > 0) button.Width = width;
        button.Click += async (_, _) =>
        {
            if (await ExecuteAsync(action) && closeOnSuccess) _activeDialog?.Close();
        };
        _mutations.Add(button);
        return button;
    }

    private Button PaButton(string text, Func<Task> action)
    {
        var button = new Button { Content = text, MinHeight = 54 };
        button.Click += async (_, _) =>
        {
            if (_paBusy) return;
            _paBusy = true;
            try { await action(); }
            catch (Exception ex) { _paStatus.Text = ex.Message; }
            finally { _paBusy = false; UpdatePaList(); }
        };
        return button;
    }

    private void UpdatePaList()
    {
        var previous = (_announcements.SelectedItem as AnnouncementItem)?.Id;
        var items = _paQueue.Read();
        _announcements.ItemsSource = items;
        _announcements.SelectedItem = items.FirstOrDefault(x => x.Id == previous);
    }

    private async Task PlaySelectedAsync()
    {
        if (_announcements.SelectedItem is not AnnouncementItem item)
            throw new InvalidOperationException("Select an announcement first");
        // Synthesize before claiming; a failed provider request leaves it pending.
        // Playback may be uncertain after a crash, so claim before sending audio.
        var ai = _voiceMode.SelectedIndex == 1;
        _paStatus.Text = ai ? "Generating synthetic AI speech…" : "Generating offline speech…";
        var style = _paStyle.SelectedIndex switch
        {
            1 => "Energetic hockey arena PA voice. Excited but intelligible, with strong emphasis on the goal or penalty. No additional words.",
            2 => "Calm, clear and precise hockey arena PA delivery. No additional words.",
            _ => AnnouncementSpeech.DefaultInstructions
        };
        var wav = await _speech.SynthesizeAsync(item.Script, ai,
            _aiVoice.SelectedItem?.ToString() ?? "onyx", style);
        _paQueue.Mark(item.Id, "PLAYING", "PENDING", "NEEDS_REVIEW");
        try
        {
            _paStatus.Text = "Playing announcement on default Windows audio output…";
            await AnnouncementSpeech.PlayWavAsync(wav);
            _paQueue.Mark(item.Id, "PLAYED", "PLAYING");
            _paStatus.Text = "Announcement played.";
        }
        catch
        {
            _paQueue.Mark(item.Id, "NEEDS_REVIEW", "PLAYING");
            throw;
        }
    }

    private Task SkipSelectedAsync()
    {
        if (_announcements.SelectedItem is not AnnouncementItem item)
            throw new InvalidOperationException("Select an announcement first");
        _paQueue.Mark(item.Id, "SKIPPED", "PENDING", "NEEDS_REVIEW");
        _paStatus.Text = "Announcement skipped; no audio sent.";
        return Task.CompletedTask;
    }

    private async Task<bool> ExecuteAsync(Func<Task> action)
    {
        if (_busy || !_connected) return false;
        _busy = true;
        SetEnabled(false);
        try
        {
            await action();
            _status.Text = "Command accepted by rink authority";
            return true;
        }
        catch (Exception ex)
        {
            _status.Text = ex.Message;
            return false;
        }
        finally
        {
            // Release the command lock before reconciling the authoritative
            // snapshot. RefreshAsync intentionally skips while _busy is true;
            // keeping the lock here stranded every mutation button disabled.
            _busy = false;
            await RefreshAsync();
        }
    }

    private async void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (_activeDialog is not null || e.Key != Key.Space || e.Source is TextBox || e.Source is Button || e.Source is CheckBox) return;
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
            foreach (var ev in snapshot.Events ?? [])
                if (_seenPaEvents.Add(ev.Id)) _paQueue.Stage(ev, recovered: !_paInitialized);
            _paInitialized = true;
            if (!_paBusy) UpdatePaList();
            _connected = true;
            _connection.Text = snapshot.Running ? "● AUTHORITY CONNECTED · RUNNING" : "● AUTHORITY CONNECTED · STOPPED";
            _connection.Foreground = Brushes.LightGreen;
            _time.Text = snapshot.DisplayTime;
            _period.Text = $"PERIOD {snapshot.Period}";
            _score.Text = $"HOME {snapshot.Home}  —  {snapshot.Away} AWAY";
            _rules.Text = $"Clock mode {snapshot.ClockMode} · Rules {snapshot.TimingVersion} · Revision {snapshot.Revision}";
            _penalties.Text = "Penalty state: " + snapshot.PenaltiesJson;
            _recent.Text = snapshot.Events?.LastOrDefault() is { } last
                ? $"{last.Type.Replace('_', ' ')} · {(last.Team ?? "game").ToUpperInvariant()}"
                : "No committed events";
            _eventHistory.ItemsSource = (snapshot.Events ?? [])
                .Reverse().Take(80).Select(ev =>
                    ev.Type.Replace('_', ' ') + (ev.Team is null ? "" : " · " + ev.Team.ToUpperInvariant()) +
                    " · " + ev.DetailsJson).ToArray();
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
