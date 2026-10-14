"""Pure unit tests for the read-only live Bench preflight.

These do not replace a real Bench installation or tenant authorization tests.
"""
import unittest
from types import SimpleNamespace
from icebreaker_league.bench_preflight import inspect_bench, DOCTYPE_NAMES, REQUIRED_FIELDS


class FakeMeta:
    def __init__(self, name, broad=False, missing=None):
        self.name = name
        self.permissions = [SimpleNamespace(role="System Manager", read=1, write=1)]
        if broad:
            self.permissions.append(SimpleNamespace(role="IceBreaker League Admin", read=1))
        self.missing = set(missing or [])

    def has_field(self, field):
        return field in REQUIRED_FIELDS.get(self.name, ()) and field not in self.missing


class FakeBench:
    def __init__(self):
        self.apps = ["frappe", "icebreaker_league"]
        self.role_exists = True
        self.broad = set()
        self.missing = {}
        self.db = SimpleNamespace(exists=lambda doctype, name:
                                  self.role_exists if (doctype, name) ==
                                  ("Role", "IceBreaker League Admin") else False)

    def get_installed_apps(self):
        return self.apps

    def get_meta(self, name):
        if name not in DOCTYPE_NAMES:
            raise ValueError("Unknown DocType")
        return FakeMeta(name, broad=name in self.broad, missing=self.missing.get(name))


class TestBenchPreflight(unittest.TestCase):
    def test_all_expected_schema_and_narrow_permissions_pass(self):
        bench = FakeBench()
        result = inspect_bench(bench)
        self.assertEqual(result["status"], "PREFLIGHT_PASSED")
        self.assertEqual(len(result["checks"]), len(DOCTYPE_NAMES) + 2)
        self.assertIn("Does not run tenant isolation", result["limitations"])

    def test_missing_app_role_or_field_fails_closed(self):
        bench = FakeBench()
        bench.apps = ["frappe"]
        self.assertEqual(inspect_bench(bench)["status"], "PREFLIGHT_FAILED")
        bench.apps = ["frappe", "icebreaker_league"]
        bench.role_exists = False
        self.assertEqual(inspect_bench(bench)["status"], "PREFLIGHT_FAILED")
        bench.role_exists = True
        bench.missing = {"IceBreaker Game": {"scheduled_utc"}}
        self.assertEqual(inspect_bench(bench)["status"], "PREFLIGHT_FAILED")

    def test_broad_generic_role_grant_fails_closed(self):
        bench = FakeBench()
        bench.broad.add("IceBreaker Training Policy")
        result = inspect_bench(bench)
        self.assertEqual(result["status"], "PREFLIGHT_FAILED")
        self.assertIn("broad grants", str(result["checks"]))


if __name__ == "__main__":
    unittest.main()
