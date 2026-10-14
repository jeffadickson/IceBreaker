"""Central course definitions; no certificates, participant PII or attachments."""
import re
import frappe
from frappe.model.document import Document
from icebreaker_league.model_rules import stable_id_ok

CODE = re.compile(r"[A-Z][A-Z0-9_]{1,79}\\Z")


class IceBreakerTrainingCourse(Document):
    def validate(self):
        if not stable_id_ok(self.icebreaker_id):
            frappe.throw("Invalid stable course ID")
        if not isinstance(self.course_code, str) or not CODE.fullmatch(self.course_code):
            frappe.throw("Course code must be uppercase letters, digits or underscores")
        if not self.course_title or len(self.course_title) > 160:
            frappe.throw("Invalid course title")
        if not self.issuer or len(self.issuer) > 100:
            frappe.throw("Invalid training issuer")
        if not self.is_new():
            old = self.get_doc_before_save()
            if old and (old.icebreaker_id != self.icebreaker_id or
                        old.course_code != self.course_code):
                frappe.throw("Course identity and code cannot be changed")
