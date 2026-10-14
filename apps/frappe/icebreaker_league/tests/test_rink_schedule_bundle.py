"""M3 signed schedule bundle tests without a running Frappe Bench."""
import base64
import copy
import unittest
from datetime import datetime, timezone
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from icebreaker_league.rink_schedule_bundle import (
    make_unsigned, sign_bundle, verify_bundle, canonical_bytes,
)

ISSUED = "2026-10-13T20:00:00Z"
EXPIRES = "2026-10-14T20:00:00Z"
NOW = datetime(2026, 10, 13, 21, tzinfo=timezone.utc)


def game(game_id="demo-game-1"):
    return {"game_id": game_id, "division_id": "demo-10u",
            "home_team_id": "maple", "away_team_id": "flyers",
            "scheduled_utc": "2026-10-14T18:00:00Z",
            "schedule_status": "Scheduled"}


class TestSignedScheduleBundle(unittest.TestCase):
    def setUp(self):
        self.private = Ed25519PrivateKey.generate()
        self.seed = self.private.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption())
        self.trusted = {"dev-schedule-key": {
            "issuer": "icebreaker-league-dev",
            "leagues": ["demo-league"],
            "public_key_base64": base64.b64encode(self.private.public_key().public_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PublicFormat.Raw)).decode("ascii"),
        }}
        self.unsigned = make_unsigned("demo-league", [game()], ISSUED, EXPIRES)

    def signed(self):
        return sign_bundle(self.unsigned, self.seed)

    def verify(self, bundle, **kwargs):
        return verify_bundle(bundle, self.trusted, "demo-league", now=NOW, **kwargs)

    def test_monotonic_revision_v2_roundtrip_and_validation(self):
        value = make_unsigned("demo-league", [game()], ISSUED, EXPIRES,
                              release_revision=4)
        self.assertEqual(value["schema_version"], 2)
        self.assertEqual(self.verify(sign_bundle(value, self.seed))["release_revision"], 4)
        for invalid in (0, -1, True, 1.5, 2147483648):
            with self.subTest(revision=invalid):
                with self.assertRaisesRegex(ValueError, "revision"):
                    make_unsigned("demo-league", [game()], ISSUED, EXPIRES,
                                  release_revision=invalid)
        signed = sign_bundle(value, self.seed)
        signed["release_revision"] = 5
        with self.assertRaisesRegex(ValueError, "signature"):
            self.verify(signed)

    def test_roundtrip_and_deterministic_canonicalization(self):
        result = self.verify(self.signed())
        self.assertEqual(result["league_id"], "demo-league")
        self.assertEqual(result["games"][0]["game_id"], "demo-game-1")
        self.assertEqual(len(result["bundle_sha256"]), 64)
        self.assertEqual(canonical_bytes(self.unsigned), canonical_bytes(
            dict(reversed(list(self.unsigned.items())))))

    def test_tampering_and_extra_private_fields_rejected(self):
        for change in (
            lambda x: x["games"][0].update({"scheduled_utc": "2026-10-14T19:00:00Z"}),
            lambda x: x["games"][0].update({"birth_date": "2016-01-01"}),
            lambda x: x.update({"private_contact": "secret"}),
            lambda x: x.update({"league_id": "other-league"}),
            lambda x: x.update({"fictional": False}),
        ):
            with self.subTest(change=change):
                value = copy.deepcopy(self.signed())
                change(value)
                with self.assertRaises(ValueError):
                    self.verify(value)

    def test_key_and_league_scope(self):
        value = self.signed()
        self.trusted["dev-schedule-key"]["leagues"] = ["other-league"]
        with self.assertRaisesRegex(ValueError, "not authorized"):
            self.verify(value)
        self.trusted["dev-schedule-key"]["leagues"] = ["demo-league"]
        with self.assertRaisesRegex(ValueError, "outside requested league"):
            verify_bundle(value, self.trusted, "other-league", now=NOW)
        self.trusted["dev-schedule-key"]["issuer"] = "wrong"
        with self.assertRaisesRegex(ValueError, "Untrusted"):
            self.verify(value)

    def test_expired_future_and_malformed(self):
        with self.assertRaisesRegex(ValueError, "expired"):
            verify_bundle(self.signed(), self.trusted, "demo-league",
                          now=datetime(2026, 10, 14, 20, tzinfo=timezone.utc))
        with self.assertRaisesRegex(ValueError, "future"):
            verify_bundle(self.signed(), self.trusted, "demo-league",
                          now=datetime(2026, 10, 13, 19, tzinfo=timezone.utc))
        for changed in (
            {"scheduled_utc": "2026-10-14T11:00:00-07:00"},
            {"schedule_status": "Final"},
            {"home_team_id": "flyers"},
        ):
            with self.subTest(changed=changed):
                games = [dict(game(), **changed)]
                with self.assertRaises(ValueError):
                    make_unsigned("demo-league", games, ISSUED, EXPIRES)

    def test_no_duplicate_or_unsorted_games(self):
        with self.assertRaisesRegex(ValueError, "unique"):
            make_unsigned("demo-league", [game(), game()], ISSUED, EXPIRES)
        with self.assertRaises(ValueError):
            make_unsigned("demo-league", [game("g1"), game("g2")], ISSUED,
                          "2026-11-14T20:00:00Z")


if __name__ == "__main__":
    unittest.main()
