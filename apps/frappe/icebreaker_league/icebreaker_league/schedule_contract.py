"""M2 strict fictional game schedule contract; no private data or results."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

MAX_GAMES = 500
GAME_FIELDS = frozenset({
    "icebreaker_id", "division", "home_team", "away_team",
    "scheduled_source_iso", "scheduled_utc", "scheduled_at",
    "venue", "rink", "source_game_state", "schedule_status",
})
ALLOWED_SOURCE_STATES = frozenset({"Scheduled", "Live", "Final"})
ALLOWED_SCHEDULE_STATES = frozenset({"Scheduled", "Postponed", "Cancelled"})


def normalize_start(source, utc_value, naive_value, league_timezone):
    """Check source offset and UTC conversion without relying on server timezone."""
    if not isinstance(source, str) or len(source) > 40:
        raise ValueError("Invalid offset-aware schedule time")
    try:
        parsed = datetime.fromisoformat(source.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError("Missing timezone offset")
        expected = parsed.astimezone(timezone.utc)
        if expected.strftime("%Y-%m-%dT%H:%M:%SZ") != utc_value:
            raise ValueError("UTC schedule mismatch")
        if expected.strftime("%Y-%m-%d %H:%M:%S") != naive_value:
            raise ValueError("Frappe schedule datetime must be UTC")
        # A league-local offset is required for this M2 pilot. Future neutral
        # venue-timezone scheduling is a separate feature.
        local = expected.astimezone(ZoneInfo(league_timezone))
        if local.utcoffset() != parsed.utcoffset():
            raise ValueError("League timezone does not match supplied offset")
    except (TypeError, ZoneInfoNotFoundError, OverflowError) as error:
        raise ValueError("Invalid schedule timezone") from error
    return expected


def validate_schedule_snapshot(payload, league_timezone):
    from .model_rules import stable_id_ok
    if not isinstance(payload, dict) or set(payload) != {"schema_version", "fictional", "games"}:
        raise ValueError("Unexpected schedule snapshot structure")
    if payload["schema_version"] != 2 or payload["fictional"] is not True:
        raise ValueError("Only fictional M2 schedule snapshots are accepted")
    rows = payload["games"]
    if not isinstance(rows, list) or len(rows) > MAX_GAMES:
        raise ValueError("Invalid game count")
    if not isinstance(league_timezone, str):
        raise ValueError("Missing league timezone")
    seen = set()
    result = []
    for row in rows:
        if not isinstance(row, dict) or set(row) != GAME_FIELDS:
            raise ValueError("Unexpected game field")
        identifier = row["icebreaker_id"]
        if not stable_id_ok(identifier) or identifier in seen:
            raise ValueError("Duplicate or invalid game ID")
        seen.add(identifier)
        if not all(isinstance(row[k], str) and len(row[k]) <= 160 and row[k].strip()
                   for k in GAME_FIELDS):
            raise ValueError("Missing or invalid game field")
        for key in ("division", "home_team", "away_team"):
            if not stable_id_ok(row[key]):
                raise ValueError("Invalid linked stable ID")
        if row["home_team"] == row["away_team"]:
            raise ValueError("Teams must be different")
        if row["source_game_state"] not in ALLOWED_SOURCE_STATES:
            raise ValueError("Invalid source game state")
        if row["schedule_status"] not in ALLOWED_SCHEDULE_STATES:
            raise ValueError("Invalid schedule state")
        normalize_start(row["scheduled_source_iso"], row["scheduled_utc"],
                        row["scheduled_at"], league_timezone)
        result.append(dict(row))
    return result
