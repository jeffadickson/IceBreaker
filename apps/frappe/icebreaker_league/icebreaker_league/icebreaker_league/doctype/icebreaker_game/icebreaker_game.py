"""Validation controller for IceBreaker Game."""
from frappe.model.document import Document
from icebreaker_league.validation import validate_document


class IceBreakerGame(Document):
    def validate(self):
        validate_document(self)
