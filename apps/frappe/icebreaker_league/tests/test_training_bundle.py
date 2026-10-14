"""M4 training policy delivery contract tests, no live Bench required."""
import copy
import unittest
from datetime import datetime, timezone
from icebreaker_league.training_bundle import (
    canonical_bytes, make_unsigned, sign_bundle, validate_unsigned, verify_bundle,
)


def policy():
    return {
        "training_course": "course-safesport", "role": "COACH",
        "renewal_mode": "ANNUAL_SEASON", "validity_days": None,
        "required": True, "effective_from": "2026-09-01",
        "effective_to": None, "revision": 1, "season": "demo-2026",
    }


class TrainingBundleTests(unittest.TestCase):
    def setUp(self):
        self.unsigned = make_unsigned(
            "demo-league", [policy()], "2026-10-14T12:00:00Z",
            "2026-10-15T12:00:00Z", release_revision=4)
        self.now = datetime(2026, 10, 14, 13, tzinfo=timezone.utc)

    def test_canonical_and_valid(self):
        self.assertEqual(self.unsigned["policies"][0]["role"], "COACH")
        self.assertEqual(canonical_bytes({"z": 2, "a": 1}),
                         b'{"a":1,"z":2}')
        self.assertIs(validate_unsigned(self.unsigned), self.unsigned)

    def test_rejects_private_fields_and_invalid_dates(self):
        for mutate in (
            lambda b: b["policies"][0].update({"birth_date": "2016-01-01"}),
            lambda b: b["policies"][0].update({"renewal_mode": "ROLLING_DAYS"}),
            lambda b: b["policies"][0].update({"effective_to": "2026-01-01"}),
            lambda b: b.update({"fictional": False}),
            lambda b: b.update({"release_revision": 0}),
            lambda b: b.update({"expires_at": "2026-11-15T12:00:00Z"}),
        ):
            value = copy.deepcopy(self.unsigned)
            mutate(value)
            with self.assertRaises(ValueError):
                validate_unsigned(value)

    def test_duplicate_and_unsorted_rejected(self):
        value = copy.deepcopy(self.unsigned)
        value["policies"].append(copy.deepcopy(value["policies"][0]))
        with self.assertRaises(ValueError):
            validate_unsigned(value)

    def test_signed_contract_when_cryptography_available(self):
        try:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
            from cryptography.hazmat.primitives import serialization
        except ImportError:
            self.skipTest("cryptography optional in pure contract test environment")
        key = Ed25519PrivateKey.generate()
        seed = key.private_bytes(serialization.Encoding.Raw,
                                 serialization.PrivateFormat.Raw,
                                 serialization.NoEncryption())
        public = key.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        import base64
        trust = {"dev-training-key": {
            "issuer": "icebreaker-league-dev", "leagues": ["demo-league"],
            "public_key_base64": base64.b64encode(public).decode("ascii")}}
        signed = sign_bundle(self.unsigned, seed)
        verified = verify_bundle(signed, trust, "demo-league", now=self.now)
        self.assertEqual(verified["release_revision"], 4)
        with self.assertRaises(ValueError):
            verify_bundle(signed, trust, "demo-league", now=self.now,
                          minimum_revision=4)
        tampered = copy.deepcopy(signed)
        tampered["policies"][0]["required"] = False
        with self.assertRaises(ValueError):
            verify_bundle(tampered, trust, "demo-league", now=self.now)
        with self.assertRaises(ValueError):
            verify_bundle(signed, trust, "other-league", now=self.now)


if __name__ == "__main__":
    unittest.main()
