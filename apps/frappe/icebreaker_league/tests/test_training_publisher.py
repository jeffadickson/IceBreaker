"""M4.4 offline publisher: revisions, idempotency, signing and isolation."""
import base64
import json
import os
from pathlib import Path
import sqlite3
import stat
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from icebreaker_league.training_bundle import canonical_bytes, make_unsigned, verify_bundle
from icebreaker_league.training_publisher import init, publish, latest
from icebreaker_league.publish_training_cli import run


def policy(required=True):
    return {
        "training_course": "course-safesport", "role": "COACH",
        "renewal_mode": "ANNUAL_SEASON", "validity_days": None,
        "required": required, "effective_from": "2026-09-01",
        "effective_to": None, "revision": 1 if required else 2,
        "season": "demo-2026",
    }


def preview(instant, policies=None):
    import hashlib
    stamp = lambda dt: dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    unsigned = make_unsigned(
        "demo-league", policies if policies is not None else [policy()],
        stamp(instant), stamp(instant + timedelta(hours=24)), release_revision=1)
    return {
        "preview_only": True, "signed": False,
        "release_revision_allocated": False,
        "policy_count": len(unsigned["policies"]),
        "bundle_sha256": hashlib.sha256(canonical_bytes(unsigned)).hexdigest(),
        "unsigned_bundle": unsigned,
    }


@unittest.skipUnless(
    __import__("importlib").util.find_spec("cryptography"),
    "cryptography not installed")
class TrainingPublisherTests(unittest.TestCase):
    def setUp(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives import serialization
        self.private = Ed25519PrivateKey.generate()
        self.seed = self.private.private_bytes(
            serialization.Encoding.Raw, serialization.PrivateFormat.Raw,
            serialization.NoEncryption())
        public = self.private.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.trust = {"dev-training-key": {
            "issuer": "icebreaker-league-dev", "leagues": ["demo-league"],
            "public_key_base64": base64.b64encode(public).decode("ascii")}}
        self.now = datetime(2026, 10, 14, 15, tzinfo=timezone.utc)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = sqlite3.connect(":memory:", isolation_level=None)
        self.addCleanup(self.db.close)
        init(self.db)

    def release(self, data=None, **kwargs):
        return publish(self.db, data or preview(self.now), self.seed,
                       approved_by="reviewer", approval_ticket="DEV-123",
                       now=self.now, **kwargs)

    def test_first_release_signature_and_exact_retry(self):
        first = self.release()
        self.assertEqual((first["status"], first["release_revision"]), ("published", 1))
        self.assertEqual(
            verify_bundle(first["envelope"], self.trust, "demo-league", now=self.now)
            ["release_revision"], 1)
        retry = self.release()
        self.assertEqual(retry["status"], "duplicate")
        self.assertEqual(retry["envelope"], first["envelope"])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM training_release").fetchone()[0], 1)

    def test_change_advances_and_replay_cannot_rollback(self):
        first = self.release()
        changed = self.release(preview(self.now, [policy(False)]))
        self.assertEqual(changed["release_revision"], 2)
        self.assertEqual(latest(self.db, "demo-league"), changed["envelope"])
        self.assertEqual(self.release()["release_revision"], 3)
        self.assertNotEqual(first["envelope"]["signature"], changed["envelope"]["signature"])

    def test_expired_release_renews_without_overwriting_history(self):
        first = self.release()
        self.now += timedelta(days=2)
        second = self.release(preview(self.now))
        self.assertEqual(second["release_revision"], 2)
        self.assertNotEqual(first["envelope"]["issued_at"], second["envelope"]["issued_at"])

    def test_rejects_modified_or_unapproved_preview_without_allocation(self):
        original = preview(self.now)
        attempts = [
            {**original, "preview_only": False},
            {**original, "bundle_sha256": "0" * 64},
            {**original, "policy_count": 99},
            {**original, "unexpected": "secret"},
            preview(self.now - timedelta(hours=3)),
        ]
        for data in attempts:
            with self.assertRaises(ValueError):
                self.release(data)
        with self.assertRaises(ValueError):
            publish(self.db, original, self.seed, approved_by="", approval_ticket="DEV-123", now=self.now)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM training_release").fetchone()[0], 0)

    def test_atomic_rollback_when_signing_fails(self):
        with patch("icebreaker_league.training_publisher.sign_bundle", side_effect=RuntimeError("signer offline")):
            with self.assertRaises(RuntimeError):
                self.release()
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM training_release").fetchone()[0], 0)
        self.assertEqual(self.release()["release_revision"], 1)

    def test_cli_rejects_production_and_unsafe_database(self):
        root = Path(self.tmp.name)
        src = root / "preview.json"
        src.write_bytes(canonical_bytes(preview(datetime.now(timezone.utc).replace(microsecond=0))))
        key = root / "signing-key.hex"
        key.write_text(self.seed.hex(), encoding="ascii")
        key.chmod(stat.S_IRUSR | stat.S_IWUSR)
        class Args: pass
        args = Args()
        args.preview, args.key_file = str(src), str(key)
        args.state_db, args.output = str(root / "releases.sqlite"), str(root / "signed.json")
        args.approved_by, args.approval_ticket = "reviewer", "DEV-123"
        with patch.dict(os.environ, {"ICEBREAKER_PRODUCTION_MODE": "1"}):
            with self.assertRaisesRegex(ValueError, "disabled"):
                run(args)
        with patch.dict(os.environ, {"ICEBREAKER_PRODUCTION_MODE": "0"}):
            result = run(args)
            self.assertEqual(result["release_revision"], 1)
            self.assertEqual(run(args)["status"], "duplicate")
            envelope = json.loads(Path(args.output).read_text())
            self.assertEqual(verify_bundle(envelope, self.trust, "demo-league")["release_revision"], 1)
            db = sqlite3.connect(args.state_db)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM training_release").fetchone()[0], 1)
            db.close()
        if os.name == "posix":
            key.chmod(0o644)
            with self.assertRaisesRegex(ValueError, "group/world"):
                run(args)


if __name__ == "__main__":
    unittest.main()
