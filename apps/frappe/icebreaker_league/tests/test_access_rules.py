"""Conservative league-admin scope tests, without Frappe runtime."""
import unittest
from icebreaker_league.access_rules import has_scoped_access, LEAGUE_ADMIN_ROLE


class TestLeagueScope(unittest.TestCase):
    def test_guest_and_unassigned_users_fail_closed(self):
        self.assertFalse(has_scoped_access("Guest", ["System Manager"], "league-a", ["league-a"]))
        self.assertFalse(has_scoped_access("someone@example.invalid", [], "league-a", ["league-a"]))
        self.assertFalse(has_scoped_access("someone@example.invalid", [LEAGUE_ADMIN_ROLE], "league-a", []))
        self.assertFalse(has_scoped_access("someone@example.invalid", [LEAGUE_ADMIN_ROLE], "league-b", ["league-a"]))

    def test_role_and_exact_membership_are_both_required(self):
        self.assertTrue(has_scoped_access("someone@example.invalid", [LEAGUE_ADMIN_ROLE], "league-a", ["league-a"]))
        self.assertFalse(has_scoped_access("someone@example.invalid", ["Desk User"], "league-a", ["league-a"]))

    def test_system_manager_bypass_is_explicit(self):
        self.assertTrue(has_scoped_access("Administrator", ["System Manager"], "league-a", []))


if __name__ == "__main__":
    unittest.main()
