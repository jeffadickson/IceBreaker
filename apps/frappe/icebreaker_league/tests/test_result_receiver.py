"""M3 receiver behavior with a fake Frappe API; not a Bench integration test."""
import base64
import importlib
import sys
import types
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from icebreaker_league.result_contract import canonical_bytes


class FakeDb:
    def __init__(self):
        self.records = {}

    def get_value(self, doctype, name, fields, as_dict=False):
        if doctype == "IceBreaker Game":
            return "div-01" if name == "game-001" else None
        if doctype == "IceBreaker Division":
            return "season-01" if name == "div-01" else None
        if doctype == "IceBreaker Season":
            return "demo-league" if name == "season-01" else None
        if doctype == "IceBreaker Certified Result":
            if isinstance(name, dict):
                for record in self.records.values():
                    if record.get("idempotency_key") == name.get("idempotency_key"):
                        return record["icebreaker_id"]
                return None
            record = self.records.get(name)
            if not record:
                return None
            if as_dict:
                return {key: record[key] for key in fields}
            return record.get(fields)
        raise AssertionError("Unexpected query " + doctype)


class TestResultReceiver(unittest.TestCase):
    def setUp(self):
        key = Ed25519PrivateKey.generate()
        self.key = key
        pub = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.db = FakeDb()
        self.frappe = types.ModuleType("frappe")
        self.frappe.session = types.SimpleNamespace(user="admin")
        self.frappe.request = types.SimpleNamespace(method="POST")
        self.frappe.flags = types.SimpleNamespace()
        self.frappe.conf = {"icebreaker_result_public_keys": {
            "rink-dev-1": {"issuer": "rink-certification", "leagues": ["demo-league"], "public_key_base64": base64.b64encode(pub).decode()}}}
        self.frappe.db = self.db
        self.frappe.get_roles = lambda: ["System Manager"]
        self.frappe.whitelist = lambda **kwargs: (lambda fn: fn)
        self.frappe.PermissionError = PermissionError
        self.frappe.ValidationError = ValueError

        def throw(message, exc=ValueError):
            raise exc(message)
        self.frappe.throw = throw

        def get_all(doctype, filters, fields, order_by, limit_page_length):
            self.assertEqual(doctype, "IceBreaker Certified Result")
            rows = [r for r in self.db.records.values() if r["game"] == filters["game"]]
            return sorted(rows, key=lambda x: x["revision"], reverse=True)[:limit_page_length]
        self.frappe.get_all = get_all

        def get_doc(data):
            def insert(ignore_permissions=False):
                self.assertTrue(ignore_permissions)
                self.assertTrue(self.frappe.flags.icebreaker_verified_result_import)
                if data["icebreaker_id"] in self.db.records:
                    raise ValueError("Duplicate result")
                self.db.records[data["icebreaker_id"]] = dict(data)
            return types.SimpleNamespace(insert=insert)
        self.frappe.get_doc = get_doc
        self.modules = patch.dict(sys.modules, {"frappe": self.frappe})
        self.modules.start()
        self.receiver = importlib.import_module('icebreaker_league.result_receiver')
        self.addCleanup(self.modules.stop)
        self.base = dict(schema_version=3, fictional=True, league_id="demo-league",
                         game_id="game-001", revision=1, home_score=3, away_score=2,
                         journal_sha256="a"*64, certification_sha256="b"*64,
                         issued_at="2026-10-13T20:00:00Z", issuer="rink-certification",
                         key_id="rink-dev-1", idempotency_key="unique_result_000001")

    def signed(self, **changes):
        unsigned = {**self.base, **changes}
        return {**unsigned, "signature": base64.b64encode(
            self.key.sign(canonical_bytes(unsigned))).decode()}

    def test_append_only_idempotent_and_revisions(self):
        result = self.signed()
        self.assertEqual(self.receiver.preview_certified_result(result)["decision"], "insert")
        self.assertEqual(self.receiver.receive_certified_result(result)["status"], "imported")
        self.assertEqual(self.receiver.receive_certified_result(result)["status"], "unchanged")
        self.assertEqual(len(self.db.records), 1)
        with self.assertRaises(ValueError):
            self.receiver.receive_certified_result(self.signed(revision=1, home_score=4))
        with self.assertRaises(ValueError):
            self.receiver.receive_certified_result(self.signed(revision=3, idempotency_key="unique_result_000003"))
        self.assertEqual(self.receiver.receive_certified_result(
            self.signed(revision=2, idempotency_key="unique_result_000002"))["status"], "imported")
        self.assertEqual(len(self.db.records), 2)

    def test_wrong_league_and_unauthorized_actor(self):
        # Even a key authorized for multiple leagues cannot project a result
        # onto a game whose schedule belongs to a different league.
        self.frappe.conf["icebreaker_result_public_keys"]["rink-dev-1"]["leagues"].append("other-league")
        with self.assertRaises(PermissionError):
            self.receiver.receive_certified_result(self.signed(league_id="other-league"))
        self.frappe.get_roles = lambda: ["IceBreaker League Admin"]
        with self.assertRaises(PermissionError):
            self.receiver.receive_certified_result(self.signed())
        self.assertFalse(self.db.records)

    def test_no_mutation_on_bad_signature_or_reused_key(self):
        with self.assertRaises(ValueError):
            self.receiver.receive_certified_result({**self.signed(), "away_score": 7})
        self.receiver.receive_certified_result(self.signed())
        with self.assertRaises(ValueError):
            self.receiver.receive_certified_result(self.signed(revision=2))
        self.assertEqual(len(self.db.records), 1)


if __name__ == "__main__":
    unittest.main()
