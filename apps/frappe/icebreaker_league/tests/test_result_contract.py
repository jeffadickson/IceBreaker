"""M3 signature/replay tests; pure Python, no Frappe Bench required."""
import base64
import unittest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from icebreaker_league.result_contract import canonical_bytes, verify_envelope, classify_revision


class TestSignedResults(unittest.TestCase):
    def setUp(self):
        self.key = Ed25519PrivateKey.generate()
        pub = self.key.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.trust = {"rink-dev-1": {"issuer": "rink-certification", "leagues": ["demo-league"],
                                      "public_key_base64": base64.b64encode(pub).decode()}}
        self.payload = dict(
            schema_version=3, fictional=True, league_id="demo-league", game_id="game-001",
            revision=1, home_score=4, away_score=2, journal_sha256="a"*64,
            certification_sha256="b"*64, issued_at="2026-10-13T20:00:00Z",
            issuer="rink-certification", key_id="rink-dev-1",
            idempotency_key="random_opaque_00001")

    def signed(self, changes=None):
        unsigned = dict(self.payload)
        unsigned.update(changes or {})
        return {**unsigned, "signature": base64.b64encode(
            self.key.sign(canonical_bytes(unsigned))).decode()}

    def test_valid_signature_and_idempotent_revision(self):
        verified = verify_envelope(self.signed(), self.trust)
        self.assertEqual(classify_revision(None, 0, verified), "insert")
        self.assertEqual(classify_revision(verified, 1, verified), "duplicate")
        self.assertEqual(classify_revision({**verified, "idempotency_key": "another"}, 1, verified), "conflict")
        self.assertEqual(classify_revision(None, 2, verified), "out_of_order")

    def test_tamper_wrong_key_and_private_field_rejected(self):
        original = self.signed()
        for key, value in (("home_score", 9), ("journal_sha256", "c"*64),
                           ("game_id", "game-002")):
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify_envelope({**original, key: value}, self.trust)
        with self.assertRaises(ValueError):
            verify_envelope(original, {})
        with self.assertRaises(ValueError):
            verify_envelope(original, {"rink-dev-1": {**self.trust["rink-dev-1"], "leagues": ["other-league"]}})
        with self.assertRaises(ValueError):
            verify_envelope({**original, "birth_date": "2016-01-01"}, self.trust)

    def test_rejects_invalid_timestamps_scores_and_pilot_flag(self):
        for key, value in (("issued_at", "2026-10-13T20:00:00"),
                           ("home_score", True), ("revision", 0), ("fictional", False)):
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify_envelope(self.signed({key: value}), self.trust)


if __name__ == "__main__":
    unittest.main()
