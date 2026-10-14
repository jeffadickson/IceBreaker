"""Strict, privacy-safe administrative migration snapshot contract (M1)."""
from .model_rules import stable_id_ok, season_dates_ok

KINDS = {
    "leagues": ("icebreaker_id", "league_title", "timezone", "public_scoreboard_enabled"),
    "seasons": ("icebreaker_id", "season_title", "league", "start_date", "end_date"),
    "divisions": ("icebreaker_id", "division_title", "season", "rules_version"),
    "clubs": ("icebreaker_id", "club_title", "league"),
    "teams": ("icebreaker_id", "team_title", "division", "club", "short_name"),
}
MAX_ROWS = 500


def validate_snapshot(payload):
    if not isinstance(payload, dict) or set(payload) != set(KINDS) | {"schema_version", "fictional"}:
        raise ValueError("Unexpected snapshot structure")
    if payload["schema_version"] != 1 or payload["fictional"] is not True:
        raise ValueError("Only fictional M1 migration snapshots are accepted")
    normalized = {}
    count = 0
    for kind, fields in KINDS.items():
        rows = payload[kind]
        if not isinstance(rows, list):
            raise ValueError(f"{kind} must be a list")
        seen = set()
        normalized[kind] = []
        for row in rows:
            count += 1
            if count > MAX_ROWS or not isinstance(row, dict) or set(row) != set(fields):
                raise ValueError("Oversized or unexpected migration row")
            identifier = row["icebreaker_id"]
            if not stable_id_ok(identifier) or identifier in seen:
                raise ValueError(f"Invalid or duplicate {kind} ID")
            seen.add(identifier)
            for field, value in row.items():
                if field == "public_scoreboard_enabled":
                    if not isinstance(value, bool):
                        raise ValueError("Invalid public scoreboard flag")
                elif field == "club" and value is None:
                    pass
                elif not isinstance(value, str) or len(value) > 160 or not value.strip():
                    raise ValueError(f"Invalid {kind}.{field}")
            if kind == "seasons" and not season_dates_ok(row["start_date"], row["end_date"]):
                raise ValueError("Season dates are reversed")
            normalized[kind].append(dict(row))
    ids = {kind: {r["icebreaker_id"] for r in rows} for kind, rows in normalized.items()}
    for row in normalized["seasons"]:
        if row["league"] not in ids["leagues"]:
            raise ValueError("Season references missing league")
    for row in normalized["divisions"]:
        if row["season"] not in ids["seasons"]:
            raise ValueError("Division references missing season")
    for row in normalized["clubs"]:
        if row["league"] not in ids["leagues"]:
            raise ValueError("Club references missing league")
    division_league = {
        d["icebreaker_id"]: next(s["league"] for s in normalized["seasons"] if s["icebreaker_id"] == d["season"])
        for d in normalized["divisions"]
    }
    club_league = {c["icebreaker_id"]: c["league"] for c in normalized["clubs"]}
    for row in normalized["teams"]:
        if row["division"] not in ids["divisions"]:
            raise ValueError("Team references missing division")
        if row["club"] is not None and (
            row["club"] not in ids["clubs"] or club_league[row["club"]] != division_league[row["division"]]
        ):
            raise ValueError("Team club and division belong to different leagues")
    return normalized
