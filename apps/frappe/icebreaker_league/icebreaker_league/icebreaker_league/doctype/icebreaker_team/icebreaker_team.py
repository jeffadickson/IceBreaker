"""Validation controller for IceBreaker Team."""
from frappe.model.document import Document
from icebreaker_league.validation import validate_document


class IceBreakerTeam(Document):
    def validate(self):
        validate_document(self)
