"""Pure domain invariants shared by Frappe DocType validation and tests."""
import re

STABLE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$")


def stable_id_ok(value):
    return isinstance(value, str) and bool(STABLE_ID_PATTERN.fullmatch(value))


def season_dates_ok(start, end):
    return bool(start and end and str(start) <= str(end))


def teams_distinct(home, away):
    return bool(home and away and home != away)


def same_division(game_division, home_division, away_division):
    return bool(game_division and game_division == home_division == away_division)


def same_league(team_league, club_league):
    return bool(team_league and team_league == club_league)
