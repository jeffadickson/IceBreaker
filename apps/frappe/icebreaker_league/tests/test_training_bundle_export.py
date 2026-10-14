"""M4 read-only Frappe preview contract and tenant scope tests (fake Frappe)."""
import importlib
import sys
import types
import unittest
from unittest.mock import patch


class TrainingBundlePreviewTests(unittest.TestCase):
    def setUp(self):
        self.roles = ["IceBreaker League Admin"]
        self.memberships = ["demo-league"]
        self.rows = [{
            "training_course": "course-safesport", "role": "COACH",
            "renewal_mode": "ANNUAL_SEASON", "validity_days": None,
            "required": 1, "effective_from": "2026-09-01",
            "effective_to": None, "revision": 1, "season": "demo-2026",
            "private_note": "DO NOT EXPORT",
        }]
        fake = types.ModuleType("frappe")
        fake.session = types.SimpleNamespace(user="fictional@example.invalid")
        fake.PermissionError = PermissionError
        fake.whitelist = lambda **kwargs: lambda fn: fn
        fake.get_roles = lambda user=None: self.roles
        fake.throw = lambda msg, exc=ValueError: (_ for _ in ()).throw(exc(msg))
        fake.db = types.SimpleNamespace(get_value=lambda dt, sid, field:
            "demo-league" if (dt, sid, field) ==
            ("IceBreaker Season", "demo-2026", "league") else None)

        def get_all(doctype, filters, pluck=None, fields=None,
                    order_by=None, limit_page_length=500):
            if doctype == "IceBreaker League Access":
                return list(self.memberships)
            if doctype == "IceBreaker Training Policy":
                self.assertEqual(filters, {"league": "demo-league"})
                return [dict(row) for row in self.rows]
            raise AssertionError("Unexpected query: " + doctype)
        fake.get_all = get_all
        self.patcher = patch.dict(sys.modules, {"frappe": fake})
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        for name in ("icebreaker_league.access", "icebreaker_league.training_api",
                     "icebreaker_league.training_bundle_export"):
            sys.modules.pop(name, None)
        self.api = importlib.import_module("icebreaker_league.training_bundle_export")

    def test_preview_is_unsigned_and_private_fields_are_excluded(self):
        result = self.api.preview_unsigned_training_bundle(
            "demo-league", "demo-2026", "2026-10-14")
        self.assertTrue(result["preview_only"])
        self.assertFalse(result["signed"])
        self.assertFalse(result["release_revision_allocated"])
        self.assertEqual(result["policy_count"], 1)
        self.assertNotIn("DO NOT EXPORT", str(result))
        self.assertNotIn("signature", result["unsigned_bundle"])
        self.assertEqual(result["unsigned_bundle"]["policies"][0]["required"], True)

    def test_cross_tenant_and_unscoped_roles_denied(self):
        self.memberships = []
        with self.assertRaises(PermissionError):
            self.api.preview_unsigned_training_bundle("demo-league")
        self.memberships = ["demo-league"]
        self.roles = ["Desk User"]
        with self.assertRaises(PermissionError):
            self.api.preview_unsigned_training_bundle("demo-league")
        self.roles = ["IceBreaker League Admin"]
        with self.assertRaises(PermissionError):
            self.api.preview_unsigned_training_bundle("other-league")
        with self.assertRaises(PermissionError):
            self.api.preview_unsigned_training_bundle("demo-league", "other-season")


if __name__ == "__main__":
    unittest.main()
