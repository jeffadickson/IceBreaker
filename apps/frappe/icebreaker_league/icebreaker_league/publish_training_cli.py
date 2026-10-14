#!/usr/bin/env python3
"""Offline fictional-only publisher; never run inside Frappe web workers.

Usage:
 python -m icebreaker_league.publish_training_cli \
   --preview /path/preview.json --state-db /path/releases.sqlite \
   --key-file /path/ed25519-seed.hex --output /path/signed.json \
   --approved-by dev-reviewer --approval-ticket DEV-123
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile

from .training_bundle import canonical_bytes
from .training_publisher import init, publish


def _existing_regular(path):
    target = Path(path).absolute()
    if target.is_symlink() or not target.is_file():
        raise ValueError("Input must be an existing regular non-symlink file")
    return target


def _key(path):
    target = _existing_regular(path)
    if os.name == "posix" and target.stat().st_mode & 0o077:
        raise ValueError("Signing seed file must not be group/world accessible")
    data = target.read_bytes()
    if len(data) > 128:
        raise ValueError("Invalid signing key file size")
    try:
        seed = bytes.fromhex(data.decode("ascii").strip())
    except (UnicodeError, ValueError) as exc:
        raise ValueError("Signing seed file must contain 64 hex characters") from exc
    if len(seed) != 32:
        raise ValueError("Signing seed must be 32 bytes")
    return seed


def run(args):
    if os.getenv("ICEBREAKER_PRODUCTION_MODE") == "1":
        raise ValueError("Development publisher disabled in production")
    preview_file = _existing_regular(args.preview)
    if preview_file.stat().st_size > 262144:
        raise ValueError("Preview too large")
    preview = json.loads(preview_file.read_text(encoding="utf-8"))
    seed = _key(args.key_file)
    state = Path(args.state_db).absolute()
    output = Path(args.output).absolute()
    if state == output or state == preview_file or state == Path(args.key_file).absolute():
        raise ValueError("Release state cannot overlap inputs or output")
    if state.exists() and (state.is_symlink() or not state.is_file()):
        raise ValueError("Unsafe release state database")
    if output.is_symlink() or (output.exists() and not output.is_file()):
        raise ValueError("Unsafe output file")
    if not state.parent.is_dir() or not output.parent.is_dir():
        raise ValueError("Release state and output directories must exist")
    db = sqlite3.connect(state, timeout=10, isolation_level=None)
    try:
        forbidden = db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND "
            "name IN ('games','players','game_events','roster_memberships',"
            "'player_private_profiles','training_completions_v2')").fetchall()
        if forbidden:
            raise ValueError("Refusing rink or private registration database")
        init(db)
        result = publish(db, preview, seed, approved_by=args.approved_by,
                         approval_ticket=args.approval_ticket)
    finally:
        db.close()
    # Crash-safe replacement of output. The committed ledger can always
    # re-export the exact signed envelope after a process crash.
    fd, tmp = tempfile.mkstemp(prefix=".training-release-", dir=output.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(canonical_bytes(result["envelope"]) + b"\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, output)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return {"status": result["status"], "release_revision": result["release_revision"],
            "league_id": result["envelope"]["league_id"],
            "policy_count": len(result["envelope"]["policies"])}


def main(argv=None):
    parser = argparse.ArgumentParser(description="IceBreaker fictional offline training publisher")
    for name in ("preview", "state-db", "key-file", "output", "approved-by", "approval-ticket"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(run(args), sort_keys=True))
    except (ValueError, OSError, sqlite3.Error, json.JSONDecodeError) as exc:
        print("Training publication refused: " + str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
