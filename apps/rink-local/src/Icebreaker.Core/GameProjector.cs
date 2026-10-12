namespace Icebreaker.Core;

public static class GameProjector
{
    public static GameView Replay(IEnumerable<GameEvent> events)
    {
        var goals = new Dictionary<string, GoalView>(StringComparer.Ordinal);
        var scores = new Dictionary<string, int>(StringComparer.Ordinal);
        var penalties = new List<PenaltyData>();
        long seq = 0;
        int period = 1, seconds = 0;
        bool running = false, mercyActive = false, mercyTriggered = false;
        foreach (var e in events)
        {
            if (e.Sequence != seq + 1) throw new InvalidDataException("Event sequence gap or duplicate.");
            seq = e.Sequence;
            period = e.Period;
            seconds = e.ClockSeconds;
            switch (e.EventType)
            {
                case "GOAL_RECORDED":
                    var g = e.Payload<GoalData>();
                    if (goals.ContainsKey(g.GoalId)) throw new InvalidDataException("Duplicate goal ID.");
                    goals.Add(g.GoalId, new GoalView(g.GoalId, g.TeamId, g.Scorer, g.Assist1, g.Assist2));
                    scores[g.TeamId] = scores.GetValueOrDefault(g.TeamId) + 1;
                    break;
                case "GOAL_ATTRIBUTION_CORRECTED":
                    var c = e.Payload<CorrectionData>();
                    if (!goals.TryGetValue(c.GoalId, out var old) || old.IsVoided)
                        throw new InvalidDataException("Correction references missing/voided goal.");
                    goals[c.GoalId] = old with { Scorer = c.Scorer, Assist1 = c.Assist1, Assist2 = c.Assist2 };
                    break;
                case "PENALTY_ASSESSED":
                    penalties.Add(e.Payload<PenaltyData>());
                    break;
                case "CLOCK_UPDATED":
                    var clock = e.Payload<ClockData>();
                    running = clock.Action switch
                    {
                        "START" => true,
                        "STOP" => false,
                        "SET" => running,
                        _ => throw new InvalidDataException("Unknown clock action.")
                    };
                    if (clock.SecondsRemaining != seconds)
                        throw new InvalidDataException("Clock envelope and payload differ.");
                    break;
                case "PERIOD_ENDED":
                case "GAME_ENDED":
                    running = false;
                    break;
                case "PERIOD_ADVANCED":
                    running = false;
                    break;
                case "MERCY_MODE_CHANGED":
                    var mercy = e.Payload<MercyModeData>();
                    mercyActive = mercy.Active;
                    mercyTriggered = mercy.HasTriggered;
                    break;
                case "CLOCK_STOP_IGNORED":
                    _ = e.Payload<ClockStopIgnoredData>();
                    break;
                default:
                    throw new InvalidDataException($"Unsupported event type {e.EventType}.");
            }
        }
        return new GameView(seq, scores, goals, penalties, period, seconds, running, mercyActive, mercyTriggered);
    }
}
