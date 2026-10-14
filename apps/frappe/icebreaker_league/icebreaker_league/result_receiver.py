"""M3 fictional-only certified-result projection; never updates rink authority.

Pilot ingestion requires a System Manager and a trusted Ed25519 public key in
Frappe site configuration. Production service-to-service auth is NOT built.
"""
import frappe
from .observability import league_span, mark_outcome
from .result_contract import verify_envelope, classify_revision

DOCTYPE = "IceBreaker Certified Result"


def _require_pilot_admin():
    if frappe.session.user == "Guest" or "System Manager" not in frappe.get_roles():
        frappe.throw("Certified result pilot requires System Manager", frappe.PermissionError)
    if frappe.request and frappe.request.method != "POST":
        frappe.throw("Certified result ingestion requires POST", frappe.PermissionError)


def _verified(payload):
    keys = frappe.conf.get("icebreaker_result_public_keys") or {}
    try:
        result = verify_envelope(payload, keys)
    except (ValueError, TypeError, KeyError):
        frappe.throw("Invalid or untrusted certified result", frappe.ValidationError)
    # Frappe schedule links are authoritative for league membership only;
    # no score, clock, or player record is read or modified here.
    game = frappe.db.get_value("IceBreaker Game", result["game_id"], "division")
    if not game:
        frappe.throw("Unknown scheduled game")
    season = frappe.db.get_value("IceBreaker Division", game, "season")
    league = frappe.db.get_value("IceBreaker Season", season, "league") if season else None
    if league != result["league_id"]:
        frappe.throw("Certified result outside scheduled league", frappe.PermissionError)
    return result


def _classification(result):
    name = result["game_id"] + "-r" + str(result["revision"])
    current = frappe.db.get_value(DOCTYPE, name, ["envelope_sha256", "idempotency_key"], as_dict=True)
    if current:
        existing = {"envelope_sha256": current["envelope_sha256"],
                    "idempotency_key": current["idempotency_key"]}
    else:
        existing = None
    latest = frappe.get_all(DOCTYPE, filters={"game": result["game_id"]},
                            fields=["revision"], order_by="revision desc", limit_page_length=1)
    latest_revision = int(latest[0]["revision"]) if latest else 0
    decision = classify_revision(existing, latest_revision, result)
    # Reuse of an idempotency key on another revision/game is always a conflict.
    key_owner = frappe.db.get_value(DOCTYPE, {"idempotency_key": result["idempotency_key"]}, "name")
    if key_owner and key_owner != name:
        decision = "conflict"
    return name, decision


@frappe.whitelist(methods=["POST"])
def preview_certified_result(payload):
    _require_pilot_admin()
    with league_span("league.result_receive") as span:
        result = _verified(payload)
        _, decision = _classification(result)
        mark_outcome(span, "ok" if decision in ("insert", "duplicate") else "rejected")
        return {"dry_run": True, "decision": decision, "game_id": result["game_id"],
                "revision": result["revision"], "schema_version": 3}


@frappe.whitelist(methods=["POST"])
def receive_certified_result(payload):
    _require_pilot_admin()
    with league_span("league.result_receive") as span:
        result = _verified(payload)
        name, decision = _classification(result)
        if decision == "duplicate":
            mark_outcome(span, "ok")
            return {"status": "unchanged", "game_id": result["game_id"],
                    "revision": result["revision"]}
        if decision != "insert":
            mark_outcome(span, "rejected")
            frappe.throw("Conflicting or out-of-order certified result")
        fields = {
            "icebreaker_id": name, "game": result["game_id"], "league": result["league_id"],
            "revision": result["revision"], "home_score": result["home_score"],
            "away_score": result["away_score"], "journal_sha256": result["journal_sha256"],
            "certification_sha256": result["certification_sha256"],
            "envelope_sha256": result["envelope_sha256"],
            "idempotency_key": result["idempotency_key"], "issued_at": result["issued_at"],
            "issuer": result["issuer"], "key_id": result["key_id"],
            "signature": result["signature"],
        }
        # Frappe request transaction rolls back on failure. No manual commit.
        # The controller rejects direct UI/API inserts, edits and deletes.
        previous = getattr(frappe.flags, "icebreaker_verified_result_import", False)
        frappe.flags.icebreaker_verified_result_import = True
        try:
            frappe.get_doc({"doctype": DOCTYPE, **fields}).insert(ignore_permissions=True)
        finally:
            frappe.flags.icebreaker_verified_result_import = previous
        mark_outcome(span, "ok")
        return {"status": "imported", "game_id": result["game_id"],
                "revision": result["revision"], "schema_version": 3}
