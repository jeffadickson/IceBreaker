"""Validation controller for IceBreaker League."""
from frappe.model.document import Document
from icebreaker_league.validation import validate_document


class IceBreakerLeague(Document):
    def validate(self):
        validate_document(self)
