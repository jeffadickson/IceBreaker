"""Read-only unsigned training-policy preview for Frappe league admins.

No private evidence, players, DOBs or guardian data. The returned revision
is explicitly a placeholder: only a separate release publisher may allocate
monotonic revisions and sign a bundle for delivery to a rink.
"""
from datetime import datetime, timedelta, timezone
import hashlib

import frappe
from .access import require_league_reader
from .training_api import league_training_policies
from .training_bundle import canonical_bytes, make_unsigned
from .observability import league_span, mark_outcome


@frappe.whitelist(methods=["GET"])
def preview_unsigned_training_bundle(league_id, season_id=None, at_date=None):
    require_league_reader(league_id)
    if league_id != "demo-league":
        frappe.throw("Only fictional demo-league training preview is enabled")
    with league_span("league.training_bundle_preview") as span:
        selected = league_training_policies(league_id, season_id, at_date)
        now = datetime.now(timezone.utc).replace(microsecond=0)
        issued = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        expires = (now + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
        unsigned = make_unsigned(
            league_id, selected["policies"], issued, expires,
            release_revision=1,  # PREVIEW ONLY, never a released sequence number
        )
        mark_outcome(span, "ok")
        return {
            "preview_only": True,
            "signed": False,
            "release_revision_allocated": False,
            "policy_count": len(unsigned["policies"]),
            "bundle_sha256": hashlib.sha256(canonical_bytes(unsigned)).hexdigest(),
            "unsigned_bundle": unsigned,
        }
