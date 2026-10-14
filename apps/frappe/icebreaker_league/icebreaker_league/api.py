"""Authenticated administrative API. Never return youth or guardian PII."""
import frappe
from .observability import league_span, mark_outcome


def _require_system_manager():
    if frappe.session.user == "Guest" or "System Manager" not in frappe.get_roles():
        frappe.throw("IceBreaker administrative access required", frappe.PermissionError)


@frappe.whitelist()
def league_overview(league_id: str):
    """Read-only central administration summary for the migration pilot."""
    _require_system_manager()
    with league_span("league.overview") as span:
        if not isinstance(league_id, str) or len(league_id) > 100:
            frappe.throw("Invalid league ID")
        if not frappe.db.exists("IceBreaker League", league_id):
            frappe.throw("Unknown league")
        seasons = frappe.get_list(
            "IceBreaker Season",
            filters={"league": league_id},
            fields=["name", "season_title", "start_date", "end_date"],
            order_by="start_date desc",
            limit_page_length=100,
        )
        mark_outcome(span, "ok")
        return {
            "league_id": league_id,
            "seasons": seasons,
            "migration_status": "development",
        }
