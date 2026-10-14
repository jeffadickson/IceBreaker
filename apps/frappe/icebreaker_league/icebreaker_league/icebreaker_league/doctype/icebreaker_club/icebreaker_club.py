"""Validation controller for IceBreaker Club."""
from frappe.model.document import Document
from icebreaker_league.validation import validate_document


class IceBreakerClub(Document):
    def validate(self):
        validate_document(self)
