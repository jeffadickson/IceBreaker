"""Read-only PII-free training requirements for a single authorized league.

This is not a completion/eligibility API. The protected registration service
owns evidence and participant identities. The rink remains authoritative until
the central cutover is explicitly approved.
"""
from datetime import date
import frappe
from .access import require_league_reader
from .training_policy_rules import iso_day, choose_effective_policy
from .observability import league_span, mark_outcome

FIELDS = ["training_course", "role", "renewal_mode", "validity_days",
          "required", "effective_from", "effective_to", "revision", "season"]
MAX_ROWS = 500


def select_policies(rows, season_id, at_date):
    """Pure selection; season-specific rules override general ones."""
    selected = {}
    for row in rows:
        if row.get("season") not in (None, "", season_id):
            continue
        key = (row["training_course"], row["role"])
        selected.setdefault(key, []).append({
            **row, "effective_from": str(row["effective_from"]),
            "effective_to": str(row["effective_to"]) if row.get("effective_to") else None,
        })
    result = []
    for (course, role), policies in selected.items():
        seasonal = [p for p in policies if p.get("season") == season_id] if season_id else []
        general = [p for p in policies if not p.get("season")]
        choice = choose_effective_policy(seasonal, at_date) or choose_effective_policy(general, at_date)
        if choice:
            result.append({
                "training_course": course, "role": role,
                "renewal_mode": choice["renewal_mode"],
                "validity_days": choice["validity_days"],
                "required": bool(choice["required"]),
                "effective_from": choice["effective_from"],
                "effective_to": choice["effective_to"],
                "revision": int(choice["revision"]),
                "season": choice.get("season") or None,
            })
    return sorted(result, key=lambda r: (r["role"], r["training_course"]))


@frappe.whitelist(methods=["GET"])
def league_training_policies(league_id, season_id=None, at_date=None):
    """Authenticated league-scoped read-only policy projection, no PII."""
    require_league_reader(league_id)
    if season_id:
        if frappe.db.get_value("IceBreaker Season", season_id, "league") != league_id:
            frappe.throw("Season outside requested league", frappe.PermissionError)
    try:
        day = iso_day(at_date) if at_date else date.today().isoformat()
    except ValueError:
        frappe.throw("Invalid training policy date")
    with league_span("league.training_policy_read") as span:
        filters = {"league": league_id}
        rows = frappe.get_all(
            "IceBreaker Training Policy", filters=filters, fields=FIELDS,
            limit_page_length=MAX_ROWS + 1, order_by="effective_from asc")
        if len(rows) > MAX_ROWS:
            frappe.throw("Too many training policy revisions for one request")
        try:
            policies = select_policies(rows, season_id, day)
        except ValueError:
            frappe.throw("Invalid training policy configuration")
        mark_outcome(span, "ok")
        return {"league_id": league_id, "season_id": season_id or None,
                "as_of": day, "policies": policies}
