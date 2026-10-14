"""M4.4 offline *development* training release publisher.

Frappe never receives the signing seed. An operator-reviewed fictional preview
is signed by a separate process with a durable per-league revision ledger.
This is NOT an authenticated production publishing service or a cutover.
"""
import hashlib
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from .training_bundle import canonical_bytes, make_unsigned, sign_bundle, validate_unsigned

SCHEMA = """
CREATE TABLE IF NOT EXISTS training_release (
 league_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 content_sha256 TEXT NOT NULL,
 envelope_json TEXT NOT NULL,
 approved_by TEXT NOT NULL,
 approval_ticket TEXT NOT NULL,
 published_at TEXT NOT NULL,
 PRIMARY KEY(league_id, revision)
);
CREATE INDEX IF NOT EXISTS ix_training_release_latest
 ON training_release(league_id, revision DESC);
"""
def init(db):
    db.executescript(SCHEMA)


def _utc(value):
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError("Timezone-aware publishing time required")
    return value.astimezone(timezone.utc).replace(microsecond=0)


def _preview(preview, instant):
    if not isinstance(preview, dict) or set(preview) != {
        "preview_only", "signed", "release_revision_allocated",
        "policy_count", "bundle_sha256", "unsigned_bundle"
    }:
        raise ValueError("Unexpected preview fields")
    if (preview["preview_only"] is not True or preview["signed"] is not False
            or preview["release_revision_allocated"] is not False):
        raise ValueError("A released or signed payload is not an unsigned preview")
    unsigned = validate_unsigned(preview["unsigned_bundle"])
    if unsigned["league_id"] != "demo-league" or unsigned["release_revision"] != 1:
        raise ValueError("Only fictional demo-league placeholder preview supported")
    if (type(preview["policy_count"]) is not int or
            preview["policy_count"] != len(unsigned["policies"])):
        raise ValueError("Preview policy count mismatch")
    digest = hashlib.sha256(canonical_bytes(unsigned)).hexdigest()
    if preview["bundle_sha256"] != digest:
        raise ValueError("Preview integrity mismatch")
    issued = datetime.fromisoformat(unsigned["issued_at"].replace("Z", "+00:00"))
    expires = datetime.fromisoformat(unsigned["expires_at"].replace("Z", "+00:00"))
    if issued > instant + timedelta(minutes=5) or instant >= expires:
        raise ValueError("Expired or future-dated preview")
    if instant - issued > timedelta(hours=1):
        raise ValueError("Preview too old for publication")
    return unsigned


def publish(db, preview, seed, *, approved_by, approval_ticket,
            issuer="icebreaker-league-dev", key_id="dev-training-key",
            now=None):
    """Atomic allocation and signing. Exact retry returns stored envelope.

    The source preview is still untrusted; this function does not prove a
    human approved it. Production requires authenticated change control.
    """
    instant = _utc(now or datetime.now(timezone.utc))
    unsigned = _preview(preview, instant)
    if unsigned["issuer"] != issuer or unsigned["key_id"] != key_id:
        raise ValueError("Preview issuer or signing key differs from publisher configuration")
    if (not isinstance(approved_by, str) or not 2 <= len(approved_by) <= 100
            or not isinstance(approval_ticket, str) or
            not 2 <= len(approval_ticket) <= 100):
        raise ValueError("Named approver and approval ticket required")
    if not isinstance(seed, bytes) or len(seed) != 32:
        raise ValueError("Invalid Ed25519 signing seed")
    # Hash the policy identity independently of preview timestamps, so
    # duplicate requests never allocate a second release unnecessarily.
    content = {"league_id": unsigned["league_id"],
               "policies": unsigned["policies"],
               "issuer": issuer, "key_id": key_id}
    content_hash = hashlib.sha256(canonical_bytes(content)).hexdigest()
    db.execute("BEGIN IMMEDIATE")
    try:
        latest = db.execute(
            "SELECT revision, content_sha256, envelope_json FROM training_release "
            "WHERE league_id=? ORDER BY revision DESC LIMIT 1",
            (unsigned["league_id"],)).fetchone()
        if latest and latest[1] == content_hash:
            saved = json.loads(latest[2])
            expiry = datetime.fromisoformat(saved["expires_at"].replace("Z", "+00:00"))
            if instant < expiry:
                db.commit()
                return {"status": "duplicate", "release_revision": latest[0],
                        "envelope": saved}
        revision = latest[0] + 1 if latest else 1
        issued_at = instant.strftime("%Y-%m-%dT%H:%M:%SZ")
        expires_at = (instant + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
        to_sign = make_unsigned(
            unsigned["league_id"], unsigned["policies"], issued_at, expires_at,
            release_revision=revision, issuer=issuer, key_id=key_id)
        envelope = sign_bundle(to_sign, seed)
        db.execute(
            "INSERT INTO training_release VALUES(?,?,?,?,?,?,?)",
            (unsigned["league_id"], revision, content_hash,
             canonical_bytes(envelope).decode("ascii"), approved_by,
             approval_ticket, issued_at))
        db.commit()
        return {"status": "published", "release_revision": revision,
                "envelope": envelope}
    except BaseException:
        db.rollback()
        raise


def latest(db, league_id):
    row = db.execute(
        "SELECT envelope_json FROM training_release WHERE league_id=? "
        "ORDER BY revision DESC LIMIT 1", (league_id,)).fetchone()
    return json.loads(row[0]) if row else None
