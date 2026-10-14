"""Certified results are insert-only and can only be created by verified import."""
import frappe
from frappe.model.document import Document


class IceBreakerCertifiedResult(Document):
    def before_insert(self):
        if not getattr(frappe.flags, "icebreaker_verified_result_import", False):
            frappe.throw("Certified results require verified signed ingestion", frappe.PermissionError)

    def validate(self):
        if not getattr(frappe.flags, "icebreaker_verified_result_import", False):
            frappe.throw("Certified result records are immutable", frappe.PermissionError)
        if self.get_doc_before_save():
            frappe.throw("Certified results cannot be modified", frappe.PermissionError)

    def on_trash(self):
        frappe.throw("Certified results cannot be deleted", frappe.PermissionError)
