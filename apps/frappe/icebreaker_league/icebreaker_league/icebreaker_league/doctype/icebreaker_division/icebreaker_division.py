"""Validation controller for IceBreaker Division."""
from frappe.model.document import Document
from icebreaker_league.validation import validate_document


class IceBreakerDivision(Document):
    def validate(self):
        validate_document(self)
