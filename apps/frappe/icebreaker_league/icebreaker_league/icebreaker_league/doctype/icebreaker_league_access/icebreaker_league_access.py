"""Restricted league-scoped user grant, administered by System Manager."""
import frappe
from frappe.model.document import Document
from icebreaker_league.model_rules import stable_id_ok


class IceBreakerLeagueAccess(Document):
    def validate(self):
        if not stable_id_ok(self.icebreaker_id):
            frappe.throw("Invalid access record ID")
        if self.user in (None, "", "Guest"):
            frappe.throw("Access must reference an authenticated Frappe user")
        if not frappe.db.exists("IceBreaker League", self.league):
            frappe.throw("Unknown league")
        if not self.is_new() and self.name != self.icebreaker_id:
            frappe.throw("Access record ID cannot change")
        matches = frappe.get_all(
            "IceBreaker League Access",
            filters={"user": self.user, "league": self.league},
            pluck="name", limit_page_length=2,
        )
        if any(name != self.name for name in matches):
            frappe.throw("Duplicate user/league grant")
