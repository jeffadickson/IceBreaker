"""Privacy-safe Frappe observability tests without a running Bench."""
import os
import unittest
from unittest.mock import patch
from icebreaker_league.observability import (
    ALLOWED_OPERATIONS, ALLOWED_OUTCOMES, league_span, mark_outcome,
)
from icebreaker_league.otel_bootstrap import collector_endpoint, configure


class TestObservability(unittest.TestCase):
    def test_collector_rejects_remote_and_credentials(self):
        for endpoint in (
            "https://example.com/v1/traces",
            "http://user:password@127.0.0.1:4318/v1/traces",
            "http://127.0.0.1:4318/v1/traces?secret=1",
            "file:///tmp/traces",
        ):
            with self.subTest(endpoint=endpoint):
                with patch.dict(os.environ, {"ICEBREAKER_FRAPPE_OTLP_TRACES_URL": endpoint}):
                    with self.assertRaises(ValueError):
                        collector_endpoint()

    def test_local_collector_and_disabled_default(self):
        with patch.dict(os.environ, {
            "ICEBREAKER_FRAPPE_OTLP_TRACES_URL": "http://127.0.0.1:4318/v1/traces",
            "ICEBREAKER_FRAPPE_OTEL_ENABLED": "0",
        }):
            self.assertEqual(collector_endpoint(), "http://127.0.0.1:4318/v1/traces")
            self.assertFalse(configure())

    def test_no_dynamic_sensitive_attributes(self):
        self.assertEqual(ALLOWED_OUTCOMES, {"ok", "rejected", "error"})
        self.assertIn("league.overview", ALLOWED_OPERATIONS)
        with self.assertRaises(ValueError):
            with league_span("player.private_record"):
                pass
        with self.assertRaises(ValueError):
            mark_outcome(None, "user@example.invalid")


if __name__ == "__main__":
    unittest.main()
