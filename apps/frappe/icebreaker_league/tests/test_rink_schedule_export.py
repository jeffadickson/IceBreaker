"""Read-only Frappe schedule preview access tests with a fake runtime.

These do not replace real v16 Bench permissions and database tests.
"""
import importlib
import sys
import types
import unittest
from unittest.mock import patch


class TestRinkScheduleExport(unittest.TestCase):
    def setUp(self):
        self.user = "league-admin@example.invalid"
        self.roles = ["IceBreaker League Admin"]
        self.memberships = ["demo-league"]
        self.games = [{
            "icebreaker_id": "game-001", "division": "demo-10u",
            "home_team": "maple", "away_team": "flyers",
            "scheduled_utc": "2026-10-14T18:00:00Z",
            "schedule_status": "Scheduled",
            "private_note": "MUST NEVER EXPORT",
        }]
        fake = types.ModuleType("frappe")
        fake.session = types.SimpleNamespace(user=self.user)
        fake.PermissionError = PermissionError
        fake.whitelist = lambda **kwargs: (lambda fn: fn)
        fake.get_roles = lambda user=None: self.roles
        fake.throw = lambda message, exc=ValueError: (_ for _ in ()).throw(exc(message))
        fake.db = types.SimpleNamespace(exists=lambda doctype, name: doctype == "IceBreaker League" and name == "demo-league")

        def get_all(doctype, filters, pluck=None, fields=None, order_by=None, limit_page_length=500):
            if doctype == "IceBreaker League Access":
                return list(self.memberships)
            if doctype == "IceBreaker Season":
                self.assertEqual(filters["league"], "demo-league")
                return ["demo-2026"]
            if doctype == "IceBreaker Division":
                self.assertEqual(filters["season"], ["in", ["demo-2026"]])
                return ["demo-10u"]
            if doctype == "IceBreaker Game":
                self.assertEqual(filters["division"], ["in", ["demo-10u"]])
                return [dict(row) for row in self.games][:limit_page_length]
            raise AssertionError("Unexpected query " + doctype)
        fake.get_all = get_all
        self.module_patch = patch.dict(sys.modules, {"frappe": fake})
        self.module_patch.start()
        self.addCleanup(self.module_patch.stop)
        sys.modules.pop("icebreaker_league.access", None)
        sys.modules.pop("icebreaker_league.rink_schedule_export", None)
        self.exporter = importlib.import_module("icebreaker_league.rink_schedule_export")

    def test_scoped_preview_has_no_private_fields_or_signature(self):
        result = self.exporter.preview_unsigned_rink_schedule("demo-league")
        self.assertTrue(result["preview_only"])
        self.assertFalse(result["signed"])
        self.assertEqual(result["game_count"], 1)
        self.assertEqual(len(result["bundle_sha256"]), 64)
        game = result["unsigned_bundle"]["games"][0]
        self.assertEqual(set(game), {
            "game_id", "division_id", "home_team_id", "away_team_id",
            "scheduled_utc", "schedule_status"})
        self.assertNotIn("MUST NEVER EXPORT", str(result))
        self.assertNotIn("signature", result["unsigned_bundle"])

    def test_role_and_membership_both_required(self):
        self.memberships = []
        with self.assertRaises(PermissionError):
            self.exporter.preview_unsigned_rink_schedule("demo-league")
        self.memberships = ["demo-league"]
        self.roles = ["Desk User"]
        with self.assertRaises(PermissionError):
            self.exporter.preview_unsigned_rink_schedule("demo-league")
        self.roles = ["IceBreaker League Admin"]
        with self.assertRaises(PermissionError):
            self.exporter.preview_unsigned_rink_schedule("other-league")

    def test_oversized_and_invalid_schedule_fail_closed(self):
        self.games = [dict(self.games[0], icebreaker_id=f"game-{i:04d}") for i in range(501)]
        with self.assertRaises(ValueError):
            self.exporter.preview_unsigned_rink_schedule("demo-league")
        self.games = [dict(self.games[0], birth_date="2016-01-01",
                           scheduled_utc="2026-10-14T11:00:00-07:00")]
        with self.assertRaises(ValueError):
            self.exporter.preview_unsigned_rink_schedule("demo-league")


if __name__ == "__main__":
    unittest.main()
