"""Pure tests: no Frappe/Bench installation required."""
import unittest
from icebreaker_league.model_rules import (
    stable_id_ok, season_dates_ok, teams_distinct, same_division, same_league
)
from icebreaker_league.snapshot_contract import validate_snapshot


class TestDomainRules(unittest.TestCase):
    def test_ids_and_schedule_invariants(self):
        self.assertTrue(stable_id_ok("demo-league"))
        self.assertFalse(stable_id_ok("../unsafe"))
        self.assertFalse(stable_id_ok("a"))
        self.assertTrue(season_dates_ok("2026-09-01", "2026-12-31"))
        self.assertFalse(season_dates_ok("2027-01-01", "2026-12-31"))
        self.assertFalse(teams_distinct("same", "same"))
        self.assertFalse(same_division("d1", "d1", "d2"))
        self.assertFalse(same_league("league-a", "league-b"))

    def test_snapshot_rejects_missing_links_and_private_fields(self):
        snapshot = {
            "schema_version": 1, "fictional": True,
            "leagues": [{"icebreaker_id": "demo-league", "league_title": "Demo",
                         "timezone": "America/Los_Angeles", "public_scoreboard_enabled": True}],
            "seasons": [{"icebreaker_id": "demo-2026", "season_title": "Fall",
                         "league": "demo-league", "start_date": "2026-09-01", "end_date": "2026-12-31"}],
            "divisions": [{"icebreaker_id": "demo-10u", "division_title": "10U",
                           "season": "demo-2026", "rules_version": "v1"}],
            "clubs": [],
            "teams": [{"icebreaker_id": "team-a", "team_title": "Demo Team",
                       "division": "demo-10u", "club": None, "short_name": "A"}],
        }
        self.assertEqual(len(validate_snapshot(snapshot)["teams"]), 1)
        snapshot["teams"][0]["birth_date"] = "2016-01-01"
        with self.assertRaises(ValueError):
            validate_snapshot(snapshot)
        del snapshot["teams"][0]["birth_date"]
        snapshot["teams"][0]["division"] = "unknown"
        with self.assertRaises(ValueError):
            validate_snapshot(snapshot)

    def test_real_data_is_rejected(self):
        snapshot = {"schema_version": 1, "fictional": False,
                    "leagues": [], "seasons": [], "divisions": [], "clubs": [], "teams": []}
        with self.assertRaises(ValueError):
            validate_snapshot(snapshot)


if __name__ == "__main__":
    unittest.main()
