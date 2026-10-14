"""Append-only, scoped central training policies. No participant evidence here."""
import frappe
from frappe.model.document import Document
from icebreaker_league.model_rules import stable_id_ok
from icebreaker_league.training_policy_rules import (
    validate_policy_values, validate_revision
)


class IceBreakerTrainingPolicy(Document):
    def validate(self):
        if not self.is_new():
            frappe.throw("Published training policy is immutable; create a revision",
                         frappe.PermissionError)
        if not stable_id_ok(self.icebreaker_id):
            frappe.throw("Invalid stable training policy ID")
        try:
            validate_policy_values(
                role=self.role, renewal_mode=self.renewal_mode,
                validity_days=int(self.validity_days) if self.validity_days not in (None, "") else None,
                effective_from=self.effective_from,
                effective_to=self.effective_to,
                required=bool(int(self.required)),
                season_id=self.season)
        except (ValueError, TypeError) as exc:
            frappe.throw(str(exc))
        if not frappe.db.get_value("IceBreaker Training Course",
                                   self.training_course, "active"):
            frappe.throw("Training course is inactive or unknown")
        if self.season:
            owner = frappe.db.get_value("IceBreaker Season", self.season, "league")
            if owner != self.league:
                frappe.throw("Training policy season belongs to another league")
        # No tournament scope yet: a future Tournament DocType will have its
        # own league ownership and authorization checks.
        previous = frappe.get_all(
            "IceBreaker Training Policy",
            filters={"training_course": self.training_course, "league": self.league,
                     "season": self.season or "", "role": self.role},
            fields=["revision", "effective_from"], order_by="revision desc",
            limit_page_length=1)
        prior = previous[0] if previous else None
        try:
            validate_revision(
                {"revision": int(prior["revision"]),
                 "effective_from": str(prior["effective_from"])} if prior else None,
                {"revision": int(self.revision),
                 "effective_from": str(self.effective_from)})
        except (ValueError, TypeError) as exc:
            frappe.throw(str(exc))

    def on_trash(self):
        frappe.throw("Training policies are immutable audit records",
                     frappe.PermissionError)
