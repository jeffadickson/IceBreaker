"""M2 schedule/timezone parity without requiring a Frappe Bench."""
import unittest
from icebreaker_league.schedule_contract import validate_schedule_snapshot, normalize_start


def example():
    return {"schema_version": 2, "fictional": True, "games": [{
        "icebreaker_id": "g01", "division": "demo-10u", "home_team": "maple",
        "away_team": "flyers", "scheduled_source_iso": "2026-10-03T11:00:00-07:00",
        "scheduled_utc": "2026-10-03T18:00:00Z",
        "scheduled_at": "2026-10-03 18:00:00",
        "venue": "Fictional Arena", "rink": "Rink 2",
        "source_game_state": "Final", "schedule_status": "Scheduled"
    }]}


class TestScheduleContract(unittest.TestCase):
    def test_offset_and_utc_parity(self):
        rows = validate_schedule_snapshot(example(), "America/Los_Angeles")
        self.assertEqual(rows[0]["scheduled_utc"], "2026-10-03T18:00:00Z")
        self.assertEqual(rows[0]["source_game_state"], "Final")
        self.assertEqual(rows[0]["schedule_status"], "Scheduled")

    def test_rejects_wrong_utc_and_naive_datetime(self):
        for field, value in [
            ("scheduled_utc", "2026-10-03T11:00:00Z"),
            ("scheduled_at", "2026-10-03 11:00:00"),
            ("scheduled_source_iso", "2026-10-03T11:00:00"),
        ]:
            with self.subTest(field=field):
                x = example()
                x["games"][0][field] = value
                with self.assertRaises(ValueError):
                    validate_schedule_snapshot(x, "America/Los_Angeles")

    def test_rejects_dst_offset_mismatch(self):
        x = example()
        x["games"][0]["scheduled_source_iso"] = "2026-10-03T10:00:00-08:00"
        with self.assertRaises(ValueError):
            validate_schedule_snapshot(x, "America/Los_Angeles")

    def test_rejects_private_fields_and_invalid_links(self):
        x = example()
        x["games"][0]["birth_date"] = "2016-01-01"
        with self.assertRaises(ValueError):
            validate_schedule_snapshot(x, "America/Los_Angeles")
        x = example()
        x["games"][0]["home_team"] = "flyers"
        with self.assertRaises(ValueError):
            validate_schedule_snapshot(x, "America/Los_Angeles")

    def test_rejects_duplicate_games_and_nonfictional_input(self):
        x = example()
        x["games"].append(dict(x["games"][0]))
        with self.assertRaises(ValueError):
            validate_schedule_snapshot(x, "America/Los_Angeles")
        x = example()
        x["fictional"] = False
        with self.assertRaises(ValueError):
            validate_schedule_snapshot(x, "America/Los_Angeles")

    def test_dst_transition_utc_conversion(self):
        normalize_start("2026-11-01T01:30:00-07:00", "2026-11-01T08:30:00Z",
                        "2026-11-01 08:30:00", "America/Los_Angeles")
        normalize_start("2026-11-01T01:30:00-08:00", "2026-11-01T09:30:00Z",
                        "2026-11-01 09:30:00", "America/Los_Angeles")
        with self.assertRaises(ValueError):
            normalize_start("2026-11-01T01:30:00-06:00", "2026-11-01T07:30:00Z",
                            "2026-11-01 07:30:00", "America/Los_Angeles")


if __name__ == "__main__":
    unittest.main()
