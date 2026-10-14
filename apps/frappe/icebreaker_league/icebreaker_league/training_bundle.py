"""Fictional-only, signed central training-policy delivery contract (M4).

Pure Python: no Frappe dependency. This is a *transport* format, not a rink
eligibility engine. No player, guardian, evidence, or certificate data.
Signing keys must live outside the Frappe web worker in production.
"""
import base64
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone

ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{1,99}\Z")
UTC = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\Z")
DAY = re.compile(r"\d{4}-\d\d-\d\d\Z")
ROLES = frozenset({"PLAYER", "PARENT", "GUARDIAN", "COACH", "MANAGER", "VOLUNTEER", "OFFICIAL"})
RENEWALS = frozenset({"ONCE", "ANNUAL_CALENDAR", "ANNUAL_SEASON", "ROLLING_DAYS"})
FIELDS = frozenset({"schema_version", "fictional", "league_id", "issuer",
                    "key_id", "issued_at", "expires_at", "release_revision", "policies"})
POLICY_FIELDS = frozenset({"training_course", "role", "renewal_mode",
                           "validity_days", "required", "effective_from",
                           "effective_to", "revision", "season"})
MAX_POLICIES = 500


def canonical_bytes(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def _utc(value):
    if not isinstance(value, str) or not UTC.fullmatch(value):
        raise ValueError("Noncanonical UTC time")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Invalid UTC time") from exc
    if parsed.strftime("%Y-%m-%dT%H:%M:%SZ") != value:
        raise ValueError("Invalid UTC time")
    return parsed


def _day(value):
    if not isinstance(value, str) or not DAY.fullmatch(value):
        raise ValueError("Invalid policy day")
    from datetime import date
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Invalid policy day") from exc
    if parsed.isoformat() != value:
        raise ValueError("Noncanonical policy day")
    return value


def validate_unsigned(bundle):
    if not isinstance(bundle, dict) or set(bundle) != FIELDS:
        raise ValueError("Unexpected training bundle fields")
    if type(bundle["schema_version"]) is not int or bundle["schema_version"] != 1:
        raise ValueError("Unsupported training bundle version")
    if bundle["fictional"] is not True:
        raise ValueError("Production policy delivery not enabled")
    for field in ("league_id", "issuer", "key_id"):
        if not isinstance(bundle[field], str) or not ID.fullmatch(bundle[field]):
            raise ValueError("Invalid bundle identifier")
    revision = bundle["release_revision"]
    if type(revision) is not int or not 1 <= revision <= 2147483647:
        raise ValueError("Invalid policy release revision")
    issued, expires = _utc(bundle["issued_at"]), _utc(bundle["expires_at"])
    if not issued < expires <= issued + timedelta(days=7):
        raise ValueError("Training bundle lifetime exceeds 7 days")
    policies = bundle["policies"]
    if not isinstance(policies, list) or len(policies) > MAX_POLICIES:
        raise ValueError("Invalid training policy list")
    last = None
    for row in policies:
        if not isinstance(row, dict) or set(row) != POLICY_FIELDS:
            raise ValueError("Unexpected training policy fields")
        if not isinstance(row["training_course"], str) or not ID.fullmatch(row["training_course"]):
            raise ValueError("Invalid training course ID")
        if row["role"] not in ROLES or row["renewal_mode"] not in RENEWALS:
            raise ValueError("Invalid training policy role or renewal")
        if type(row["required"]) is not bool:
            raise ValueError("Training required must be boolean")
        if type(row["revision"]) is not int or row["revision"] < 1:
            raise ValueError("Invalid training revision")
        days = row["validity_days"]
        if row["renewal_mode"] == "ROLLING_DAYS":
            if type(days) is not int or not 1 <= days <= 3650:
                raise ValueError("Invalid rolling validity")
        elif days is not None:
            raise ValueError("Unexpected validity days")
        start = _day(row["effective_from"])
        if row["effective_to"] is not None and _day(row["effective_to"]) < start:
            raise ValueError("Invalid effective date range")
        season = row["season"]
        if season is not None and (not isinstance(season, str) or not ID.fullmatch(season)):
            raise ValueError("Invalid season")
        if row["renewal_mode"] == "ANNUAL_SEASON" and season is None:
            raise ValueError("Season renewal requires a season")
        key = (row["role"], row["training_course"])
        if last is not None and key <= last:
            raise ValueError("Training policies must be sorted and unique")
        last = key
    return bundle


def make_unsigned(league_id, policies, issued_at, expires_at,
                  release_revision, issuer="icebreaker-league-dev",
                  key_id="dev-training-key"):
    return validate_unsigned({
        "schema_version": 1, "fictional": True, "league_id": league_id,
        "issuer": issuer, "key_id": key_id,
        "issued_at": issued_at, "expires_at": expires_at,
        "release_revision": release_revision,
        "policies": sorted(policies, key=lambda p: (p["role"], p["training_course"])),
    })


def sign_bundle(unsigned, private_seed):
    """Offline development helper; NEVER expose a signer via a Frappe endpoint."""
    validate_unsigned(unsigned)
    if not isinstance(private_seed, bytes) or len(private_seed) != 32:
        raise ValueError("Ed25519 signing seed must be 32 bytes")
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    signature = Ed25519PrivateKey.from_private_bytes(private_seed).sign(canonical_bytes(unsigned))
    return {**unsigned, "signature": base64.b64encode(signature).decode("ascii")}


def verify_bundle(envelope, trusted_keys, expected_league, now=None, minimum_revision=0):
    if not isinstance(envelope, dict) or set(envelope) != FIELDS | {"signature"}:
        raise ValueError("Unexpected signed training fields")
    unsigned = validate_unsigned({k: envelope[k] for k in FIELDS})
    if unsigned["league_id"] != expected_league:
        raise ValueError("Wrong training league")
    if (type(minimum_revision) is not int or minimum_revision < 0
            or unsigned["release_revision"] <= minimum_revision):
        raise ValueError("Stale training release")
    key = trusted_keys.get(unsigned["key_id"]) if isinstance(trusted_keys, dict) else None
    if (not isinstance(key, dict) or key.get("issuer") != unsigned["issuer"]
            or expected_league not in key.get("leagues", [])):
        raise ValueError("Untrusted training signing key")
    try:
        pub = base64.b64decode(key["public_key_base64"], validate=True)
        sig = base64.b64decode(envelope["signature"], validate=True)
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Invalid signature encoding") from exc
    if len(pub) != 32 or len(sig) != 64:
        raise ValueError("Invalid Ed25519 key/signature size")
    instant = now or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        raise ValueError("Timezone-aware verifier time required")
    instant = instant.astimezone(timezone.utc)
    if instant < _utc(unsigned["issued_at"]) - timedelta(minutes=5):
        raise ValueError("Training bundle issued in future")
    if instant >= _utc(unsigned["expires_at"]):
        raise ValueError("Training bundle expired")
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    try:
        Ed25519PublicKey.from_public_bytes(pub).verify(sig, canonical_bytes(unsigned))
    except (InvalidSignature, ValueError) as exc:
        raise ValueError("Training signature invalid") from exc
    return {
        "league_id": expected_league,
        "release_revision": unsigned["release_revision"],
        "bundle_sha256": hashlib.sha256(canonical_bytes(unsigned)).hexdigest(),
        "policy_count": len(unsigned["policies"]),
        "expires_at": unsigned["expires_at"],
    }
