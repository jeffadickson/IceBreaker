"""Frappe training API authorization tests with a fake runtime.

A real two-league Bench permission/Desk test remains a production gate.
"""
import importlib
import sys
import types
import unittest
from unittest.mock import patch


class TestTrainingApi(unittest.TestCase):
    def setUp(self):
        self.roles = ["IceBreaker League Admin"]
        self.memberships = ["demo-league"]
        self.calls = []
        self.policies = [{
            "training_course": "course-safe", "role": "COACH",
            "renewal_mode": "ANNUAL_SEASON", "validity_days": None,
            "required": 1, "effective_from": "2026-09-01",
            "effective_to": None, "revision": 1, "season": "demo-2026",
            "private_note": "NEVER_RETURN_THIS",
        }]
        fake = types.ModuleType("frappe")
        fake.session = types.SimpleNamespace(user="staff@example.invalid")
        fake.PermissionError = PermissionError
        fake.whitelist = lambda **kwargs: (lambda fn: fn)
        fake.get_roles = lambda user=None: self.roles
        fake.throw = lambda message, exc=ValueError: (_ for _ in ()).throw(exc(message))
        fake.db = types.SimpleNamespace(get_value=lambda dt, id, field:
            "demo-league" if (dt, id, field) == ("IceBreaker Season", "demo-2026", "league") else None)

        def get_all(doctype, filters, pluck=None, fields=None, order_by=None, limit_page_length=500):
            self.calls.append((doctype, filters))
            if doctype == "IceBreaker League Access":
                return list(self.memberships)
            if doctype == "IceBreaker Training Policy":
                self.assertEqual(filters, {"league": "demo-league"})
                return [dict(row) for row in self.policies][:limit_page_length]
            raise AssertionError("Unexpected query " + doctype)
        fake.get_all = get_all
        self.module_patch = patch.dict(sys.modules, {"frappe": fake})
        self.module_patch.start()
        self.addCleanup(self.module_patch.stop)
        sys.modules.pop("icebreaker_league.access", None)
        sys.modules.pop("icebreaker_league.training_api", None)
        self.api = importlib.import_module("icebreaker_league.training_api")

    def test_scoped_training_policies_do_not_return_private_fields(self):
        result = self.api.league_training_policies("demo-league", "demo-2026", "2026-10-13")
        self.assertEqual(len(result["policies"]), 1)
        self.assertEqual(result["policies"][0]["role"], "COACH")
        self.assertNotIn("NEVER_RETURN_THIS", str(result))
        self.assertEqual(result["league_id"], "demo-league")

    def test_role_and_membership_required(self):
        self.memberships = []
        with self.assertRaises(PermissionError):
            self.api.league_training_policies("demo-league", "demo-2026", "2026-10-13")
        self.memberships = ["demo-league"]
        self.roles = ["Desk User"]
        with self.assertRaises(PermissionError):
            self.api.league_training_policies("demo-league", "demo-2026", "2026-10-13")
        self.roles = ["IceBreaker League Admin"]
        with self.assertRaises(PermissionError):
            self.api.league_training_policies("other-league", "demo-2026", "2026-10-13")
        with self.assertRaises(PermissionError):
            self.api.league_training_policies("demo-league", "other-season", "2026-10-13")

    def test_oversized_policy_result_rejected(self):
        self.policies *= 501
        with self.assertRaises(ValueError):
            self.api.league_training_policies("demo-league", "demo-2026", "2026-10-13")


if __name__ == "__main__":
    unittest.main()
