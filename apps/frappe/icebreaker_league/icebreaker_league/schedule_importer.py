"""M2 schedule-only importer. No game results, players, events or PII."""
import frappe
from .schedule_contract import GAME_FIELDS, validate_schedule_snapshot
from .observability import league_span, mark_outcome

DOCTYPE = "IceBreaker Game"


def _require_admin():
    if frappe.session.user == "Guest" or "System Manager" not in frappe.get_roles():
        frappe.throw("IceBreaker schedule migration requires System Manager", frappe.PermissionError)


def _parse(payload, league_id):
    if not isinstance(league_id, str) or len(league_id) > 100:
        frappe.throw("Invalid league ID")
    league = frappe.db.get_value("IceBreaker League", league_id, "timezone")
    if not league:
        frappe.throw("Unknown league")
    if isinstance(payload, str):
        if len(payload) > 150_000:
            frappe.throw("Schedule snapshot too large")
        import json
        payload = json.loads(payload)
    rows = validate_schedule_snapshot(payload, league)
    # Check all links before any writes, even if the caller supplied existing IDs.
    for row in rows:
        season = frappe.db.get_value("IceBreaker Division", row["division"], "season")
        if not season or frappe.db.get_value("IceBreaker Season", season, "league") != league_id:
            frappe.throw("Schedule division outside selected league")
        for key in ("home_team", "away_team"):
            division = frappe.db.get_value("IceBreaker Team", row[key], "division")
            if division != row["division"]:
                frappe.throw("Game team is outside selected division")
    return rows


def _existing(row):
    name = frappe.db.exists(DOCTYPE, row["icebreaker_id"])
    if not name:
        return False
    # Source schedule fields are immutable in the import. Any difference is a
    # conflict, not a silent update to an already-scheduled game.
    stored = frappe.db.get_value(DOCTYPE, name, list(GAME_FIELDS), as_dict=True)
    if any(str(stored[k]) != str(row[k]) for k in GAME_FIELDS):
        frappe.throw("Conflicting existing schedule ID")
    return True


@frappe.whitelist()
def preview_schedule_snapshot(league_id, payload):
    _require_admin()
    with league_span("league.schedule_read") as span:
        rows = _parse(payload, league_id)
        # Preview checks conflicts, too; never claim an unsafe import is ready.
        existing = sum(bool(_existing(row)) for row in rows)
        mark_outcome(span, "ok")
        return {"dry_run": True, "total": len(rows), "new": len(rows)-existing,
                "unchanged": existing, "schema_version": 2}


@frappe.whitelist(methods=["POST"])
def import_schedule_snapshot(league_id, payload):
    _require_admin()
    with league_span("league.import_commit") as span:
        rows = _parse(payload, league_id)
        # Preflight all conflicts before starting inserts. Frappe's request
        # transaction rolls back on exceptions; never commit manually.
        existing = [_existing(row) for row in rows]
        inserted = 0
        for row, already in zip(rows, existing):
            if not already:
                frappe.get_doc({"doctype": DOCTYPE, **row}).insert()
                inserted += 1
        mark_outcome(span, "ok")
        return {"imported": inserted, "unchanged": len(rows)-inserted,
                "schema_version": 2}


@frappe.whitelist()
def league_schedule(league_id, limit=100):
    """System-Manager-only schedule projection. No player or result fields."""
    _require_admin()
    with league_span("league.schedule_read") as span:
        if not isinstance(league_id, str) or len(league_id) > 100:
            frappe.throw("Invalid league ID")
        if not frappe.db.exists("IceBreaker League", league_id):
            frappe.throw("Unknown league")
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            frappe.throw("Invalid schedule limit")
        if not 1 <= limit <= 500:
            frappe.throw("Schedule limit must be between 1 and 500")
        seasons = frappe.get_list("IceBreaker Season", filters={"league": league_id},
                                  pluck="name", limit_page_length=500)
        divisions = frappe.get_list("IceBreaker Division",
                                    filters={"season": ["in", seasons]},
                                    pluck="name", limit_page_length=500) if seasons else []
        if not divisions:
            return {"games": [], "timezone": frappe.db.get_value("IceBreaker League", league_id, "timezone")}
        games = frappe.get_list(DOCTYPE,
                                filters={"division": ["in", divisions]},
                                fields=["icebreaker_id", "division", "home_team", "away_team",
                                        "scheduled_source_iso", "scheduled_utc", "venue", "rink",
                                        "source_game_state", "schedule_status"],
                                order_by="scheduled_at asc", limit_page_length=limit)
        mark_outcome(span, "ok")
        return {"games": games,
                "timezone": frappe.db.get_value("IceBreaker League", league_id, "timezone")}
