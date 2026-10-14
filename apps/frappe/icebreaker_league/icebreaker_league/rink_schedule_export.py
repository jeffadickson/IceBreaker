"""Read-only Frappe schedule projection for a future signed rink snapshot.

This API intentionally NEVER signs a snapshot. It is a preview and must not
be accepted by the rink authority. Signing and monotonic release tracking
belong to a separately authenticated KMS-backed publishing service.
"""
import hashlib
from datetime import datetime, timedelta, timezone

import frappe

from .access import require_league_reader
from .observability import league_span, mark_outcome
from .rink_schedule_bundle import canonical_bytes, make_unsigned

MAX_GAMES = 500


def project_schedule(league_id, issued_at, expires_at):
    """Build a strict fictional-only schedule projection for one league."""
    if not isinstance(league_id, str) or not 2 <= len(league_id) <= 100:
        frappe.throw("Invalid league ID")
    if league_id != "demo-league":
        frappe.throw("Only fictional demo-league export is enabled")
    if not frappe.db.exists("IceBreaker League", league_id):
        frappe.throw("Unknown league")
    seasons = frappe.get_all(
        "IceBreaker Season", filters={"league": league_id},
        pluck="name", limit_page_length=500)
    divisions = frappe.get_all(
        "IceBreaker Division", filters={"season": ["in", seasons]},
        pluck="name", limit_page_length=500) if seasons else []
    rows = frappe.get_all(
        "IceBreaker Game",
        filters={"division": ["in", divisions]},
        fields=["icebreaker_id", "division", "home_team", "away_team",
                "scheduled_utc", "schedule_status"],
        order_by="icebreaker_id asc",
        limit_page_length=MAX_GAMES + 1) if divisions else []
    if len(rows) > MAX_GAMES:
        frappe.throw("Schedule exceeds single-bundle limit")
    games = [{
        "game_id": row["icebreaker_id"],
        "division_id": row["division"],
        "home_team_id": row["home_team"],
        "away_team_id": row["away_team"],
        "scheduled_utc": row["scheduled_utc"],
        "schedule_status": row["schedule_status"],
    } for row in rows]
    return make_unsigned(league_id, games, issued_at, expires_at)


@frappe.whitelist()
def preview_unsigned_rink_schedule(league_id):
    """League-scoped, unsigned preview; NOT a rink-authoritative release."""
    require_league_reader(league_id)
    with league_span("league.rink_bundle_preview") as span:
        now = datetime.now(timezone.utc).replace(microsecond=0)
        issued = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        expires = (now + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
        unsigned = project_schedule(league_id, issued, expires)
        mark_outcome(span, "ok")
        return {
            "preview_only": True, "signed": False,
            "game_count": len(unsigned["games"]),
            "bundle_sha256": hashlib.sha256(canonical_bytes(unsigned)).hexdigest(),
            "unsigned_bundle": unsigned,
        }
