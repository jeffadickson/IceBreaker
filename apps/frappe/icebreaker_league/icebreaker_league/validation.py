"""Server-side invariants. Do not trust client form or API validation."""
import frappe
from .model_rules import stable_id_ok, season_dates_ok, teams_distinct, same_division, same_league


def _league_of_division(division):
    season = frappe.db.get_value("IceBreaker Division", division, "season")
    if not season:
        frappe.throw("Division must belong to a valid season")
    league = frappe.db.get_value("IceBreaker Season", season, "league")
    if not league:
        frappe.throw("Season must belong to a valid league")
    return league


def validate_document(doc):
    if not stable_id_ok(doc.icebreaker_id):
        frappe.throw("IceBreaker ID must be 2–100 alphanumeric, underscore or hyphen characters")
    # DocType names are the existing stable IceBreaker IDs, never a generated
    # Frappe surrogate. Existing records must not be silently reassigned.
    if not doc.is_new() and doc.name != doc.icebreaker_id:
        frappe.throw("IceBreaker stable ID is immutable")

    if doc.doctype == "IceBreaker League":
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            ZoneInfo(doc.timezone)
        except (ZoneInfoNotFoundError, TypeError, ValueError):
            frappe.throw("Invalid IANA league timezone")

    elif doc.doctype == "IceBreaker Season":
        if not season_dates_ok(doc.start_date, doc.end_date):
            frappe.throw("Season end date must not precede start date")

    elif doc.doctype == "IceBreaker Team":
        if doc.club:
            division_league = _league_of_division(doc.division)
            club_league = frappe.db.get_value("IceBreaker Club", doc.club, "league")
            if not same_league(division_league, club_league):
                frappe.throw("Club and team division must belong to the same league")

    elif doc.doctype == "IceBreaker Game":
        if not teams_distinct(doc.home_team, doc.away_team):
            frappe.throw("Home and away teams must be different")
        home_division = frappe.db.get_value("IceBreaker Team", doc.home_team, "division")
        away_division = frappe.db.get_value("IceBreaker Team", doc.away_team, "division")
        if not same_division(doc.division, home_division, away_division):
            frappe.throw("Both teams must belong to the game's division")
        from .schedule_contract import normalize_start, ALLOWED_SOURCE_STATES
        league = _league_of_division(doc.division)
        timezone = frappe.db.get_value("IceBreaker League", league, "timezone")
        try:
            normalize_start(doc.scheduled_source_iso, doc.scheduled_utc,
                            str(doc.scheduled_at), timezone)
        except ValueError as error:
            frappe.throw(str(error))
        if doc.source_game_state not in ALLOWED_SOURCE_STATES:
            frappe.throw("Invalid source game state")
        if not doc.is_new():
            old = doc.get_doc_before_save()
            if old and any(getattr(old, key, None) != getattr(doc, key, None)
                           for key in ("scheduled_source_iso", "scheduled_utc", "source_game_state")):
                frappe.throw("Source schedule import metadata is immutable")
        # Scores and certification are intentionally NOT editable in this
        # scheduling DocType; rink authority owns the certified result.
