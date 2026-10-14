"""System-Manager-only M1 importer for fictional league administration data.

No players, birth dates, emails, documents, roster records, game events,
clock data or certified scores. Never overwrite existing Frappe records.
"""
import json
import frappe
from .snapshot_contract import KINDS, validate_snapshot
from .observability import league_span, mark_outcome

DOC_TYPES = {
    "leagues": "IceBreaker League",
    "seasons": "IceBreaker Season",
    "divisions": "IceBreaker Division",
    "clubs": "IceBreaker Club",
    "teams": "IceBreaker Team",
}


def _require_admin():
    if frappe.session.user == "Guest" or "System Manager" not in frappe.get_roles():
        frappe.throw("IceBreaker import requires System Manager", frappe.PermissionError)


def _parse(payload):
    if isinstance(payload, str):
        if len(payload) > 128_000:
            frappe.throw("Migration snapshot too large")
        payload = json.loads(payload)
    return validate_snapshot(payload)


@frappe.whitelist()
def preview_admin_snapshot(payload):
    _require_admin()
    with league_span("league.import_preview") as span:
        data = _parse(payload)
        result = {
            kind: {
                "total": len(rows),
                "new": sum(not frappe.db.exists(DOC_TYPES[kind], r["icebreaker_id"]) for r in rows),
            }
            for kind, rows in data.items()
        }
        mark_outcome(span, "ok")
        return {"dry_run": True, "counts": result}


@frappe.whitelist(methods=["POST"])
def import_admin_snapshot(payload):
    _require_admin()
    with league_span("league.import_commit") as span:
        data = _parse(payload)
        inserted = {}
        for kind, rows in data.items():
            doctype = DOC_TYPES[kind]
            inserted[kind] = 0
            for row in rows:
                current = frappe.db.exists(doctype, row["icebreaker_id"])
                if current:
                    existing = frappe.db.get_value(doctype, current, list(KINDS[kind]), as_dict=True)
                    # Never silently rewrite a previously imported administrative record.
                    if any(existing[field] != value for field, value in row.items()):
                        frappe.throw(f"Conflicting existing {doctype} stable ID")
                    continue
                frappe.get_doc({"doctype": doctype, **row}).insert()
                inserted[kind] += 1
        # Frappe owns the request transaction. No explicit commit in hooks.
        mark_outcome(span, "ok")
        return {"imported": inserted, "schema_version": 1}
