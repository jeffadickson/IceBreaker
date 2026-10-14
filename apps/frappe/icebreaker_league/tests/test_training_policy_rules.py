"""M4 central training policy contract tests without a live Frappe Bench."""
import json
import unittest
from pathlib import Path
from icebreaker_league.training_projection import select_policies
from icebreaker_league.training_policy_rules import (
    iso_day, validate_policy_values, validate_revision, choose_effective_policy
)

BASE = Path(__file__).resolve().parents[1] / "icebreaker_league" / "icebreaker_league" / "doctype"


class TestCentralTrainingPolicies(unittest.TestCase):
    def test_renewal_modes_and_bounds(self):
        base = dict(role="COACH", effective_from="2026-09-01", required=True)
        for mode in ("ONCE", "ANNUAL_CALENDAR", "ANNUAL_SEASON", "ROLLING_DAYS"):
            args = dict(base, renewal_mode=mode,
                        season_id="demo-2026" if mode == "ANNUAL_SEASON" else None,
                        validity_days=365 if mode == "ROLLING_DAYS" else None)
            self.assertEqual(validate_policy_values(**args)["renewal_mode"], mode)
        for days in (0, -1, 3651, True, 1.5):
            with self.subTest(days=days), self.assertRaises(ValueError):
                validate_policy_values(**base, renewal_mode="ROLLING_DAYS",
                                       validity_days=days)
        with self.assertRaisesRegex(ValueError, "season"):
            validate_policy_values(**base, renewal_mode="ANNUAL_SEASON",
                                   validity_days=None)
        with self.assertRaisesRegex(ValueError, "only"):
            validate_policy_values(**base, renewal_mode="ONCE",
                                   validity_days=90)
        with self.assertRaisesRegex(ValueError, "role"):
            validate_policy_values(role="INVALID", renewal_mode="ONCE",
                                   effective_from="2026-09-01", validity_days=None)

    def test_date_validation(self):
        self.assertEqual(iso_day("2028-02-29"), "2028-02-29")
        for value in ("2027-02-29", "2026-1-01", "2026-13-01", "2026-10-01Z"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                iso_day(value)
        with self.assertRaisesRegex(ValueError, "end"):
            validate_policy_values(role="PLAYER", renewal_mode="ONCE",
                                   validity_days=None, effective_from="2026-09-01",
                                   effective_to="2026-08-31")

    def test_append_only_revisions_and_historical_policy(self):
        first = {"revision": 1, "effective_from": "2026-09-01", "required": True}
        second = {"revision": 2, "effective_from": "2027-09-01", "required": False}
        validate_revision(None, first)
        validate_revision(first, second)
        self.assertIs(choose_effective_policy([first, second], "2026-10-13"), first)
        self.assertIs(choose_effective_policy([first, second], "2027-10-13"), second)
        self.assertIsNone(choose_effective_policy([first], "2026-08-31"))
        for invalid in (
            {"revision": 1, "effective_from": "2027-09-01"},
            {"revision": 3, "effective_from": "2027-09-01"},
            {"revision": 2, "effective_from": "2026-09-01"},
            {"revision": 2, "effective_from": "2025-09-01"},
        ):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_revision(first, invalid)

    def test_season_specific_overrides_global_without_leaking_other_seasons(self):
        general = dict(training_course="safe-course", role="COACH",
                       renewal_mode="ONCE", validity_days=None, required=1,
                       effective_from="2026-01-01", effective_to=None,
                       revision=1, season=None)
        fall = dict(general, renewal_mode="ANNUAL_SEASON",
                    effective_from="2026-09-01", season="demo-2026")
        next_year = dict(general, effective_from="2027-09-01",
                         season="demo-2027", required=0)
        policies = [general, fall, next_year]
        self.assertEqual(select_policies(policies, "demo-2026", "2026-10-13")[0]["renewal_mode"],
                         "ANNUAL_SEASON")
        self.assertEqual(select_policies(policies, "demo-2027", "2027-10-13")[0]["required"],
                         False)
        self.assertEqual(select_policies(policies, None, "2027-10-13")[0]["renewal_mode"],
                         "ONCE")
        self.assertEqual(select_policies(policies, "demo-2026", "2026-02-01")[0]["renewal_mode"],
                         "ONCE")
        self.assertEqual(select_policies(policies, "another-season", "2026-10-13")[0]["renewal_mode"],
                         "ONCE")

    def test_doctype_privacy_and_roles(self):
        for slug in ("icebreaker_training_course", "icebreaker_training_policy"):
            schema = json.loads((BASE / slug / (slug + ".json")).read_text())
            self.assertEqual([p["role"] for p in schema["permissions"]], ["System Manager"])
            self.assertFalse(schema["permissions"][0].get("share", 0))
            self.assertFalse(schema["permissions"][0].get("delete", 0))
            fields = {f["fieldname"] for f in schema["fields"]}
            self.assertFalse(fields & {"player", "guardian", "email", "birth_date",
                                       "certificate", "document", "person_id", "address"})
        policy = json.loads((BASE / "icebreaker_training_policy" /
                             "icebreaker_training_policy.json").read_text())
        fields = {f["fieldname"]: f for f in policy["fields"]}
        self.assertEqual(fields["training_course"]["options"], "IceBreaker Training Course")
        self.assertEqual(fields["league"]["options"], "IceBreaker League")
        self.assertEqual(fields["season"]["options"], "IceBreaker Season")


if __name__ == "__main__":
    unittest.main()
