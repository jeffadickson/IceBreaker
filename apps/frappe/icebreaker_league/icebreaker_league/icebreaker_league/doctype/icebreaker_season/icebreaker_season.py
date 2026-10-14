"""Validation controller for IceBreaker Season."""
from frappe.model.document import Document
from icebreaker_league.validation import validate_document


class IceBreakerSeason(Document):
    def validate(self):
        validate_document(self)
