"""M3 pilot: strict Ed25519-signed schedule-only bundle for offline rink staging.

No player identities, private records, game rules, scores or event data.
The signer is deliberately NOT a Frappe web method: production signing
requires a dedicated KMS-backed service and monotonic release tracking.
"""
import base64
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone

FIELDS = frozenset({
    "schema_version", "fictional", "league_id", "issued_at", "expires_at",
    "issuer", "key_id", "games",
})
RELEASE_FIELDS = FIELDS | {"release_revision"}
GAME_FIELDS = frozenset({
    "game_id", "division_id", "home_team_id", "away_team_id",
    "scheduled_utc", "schedule_status",
})
IDENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{1,99}\Z")
UTC = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\Z")
STATES = frozenset({"Scheduled", "Postponed", "Cancelled"})
MAX_GAMES = 500


def _utc(value):
    if not isinstance(value, str) or not UTC.fullmatch(value):
        raise ValueError("Expected canonical UTC timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Invalid UTC timestamp") from exc
    if parsed.strftime("%Y-%m-%dT%H:%M:%SZ") != value:
        raise ValueError("Noncanonical UTC timestamp")
    return parsed


def canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def validate_unsigned(value):
    if not isinstance(value, dict):
        raise ValueError("Unexpected schedule bundle fields")
    version = value.get("schema_version")
    if type(version) is not int or version not in (1, 2):
        raise ValueError("Unsupported schedule bundle version")
    if set(value) != (RELEASE_FIELDS if version == 2 else FIELDS):
        raise ValueError("Unexpected schedule bundle fields")
    if version == 2 and (type(value["release_revision"]) is not int
                         or not 1 <= value["release_revision"] <= 2147483647):
        raise ValueError("Invalid monotonic schedule release revision")
    if value["fictional"] is not True:
        raise ValueError("Only fictional schedule bundles are accepted")
    for key in ("league_id", "issuer", "key_id"):
        if not isinstance(value[key], str) or not IDENT.fullmatch(value[key]):
            raise ValueError("Invalid schedule bundle identifier")
    issued = _utc(value["issued_at"])
    expires = _utc(value["expires_at"])
    if not issued < expires <= issued + timedelta(days=7):
        raise ValueError("Schedule bundle validity must be 1 second to 7 days")
    games = value["games"]
    if not isinstance(games, list) or len(games) > MAX_GAMES:
        raise ValueError("Invalid schedule game list")
    seen = set()
    last = ""
    for game in games:
        if not isinstance(game, dict) or set(game) != GAME_FIELDS:
            raise ValueError("Unexpected schedule game fields")
        for key in ("game_id", "division_id", "home_team_id", "away_team_id"):
            if not isinstance(game[key], str) or not IDENT.fullmatch(game[key]):
                raise ValueError("Invalid schedule game identifier")
        if game["game_id"] in seen or game["game_id"] <= last:
            raise ValueError("Schedule games must be unique and sorted")
        seen.add(game["game_id"])
        last = game["game_id"]
        if game["home_team_id"] == game["away_team_id"]:
            raise ValueError("Home and away teams must differ")
        _utc(game["scheduled_utc"])
        if game["schedule_status"] not in STATES:
            raise ValueError("Invalid schedule status")
    return value


def make_unsigned(league_id, games, issued_at, expires_at,
                  issuer="icebreaker-league-dev", key_id="dev-schedule-key",
                  release_revision=None):
    value = {
        "schema_version": 1, "fictional": True, "league_id": league_id,
        "issued_at": issued_at, "expires_at": expires_at,
        "issuer": issuer, "key_id": key_id,
        "games": sorted(games, key=lambda game: game["game_id"]),
    }
    if release_revision is not None:
        value["schema_version"] = 2
        value["release_revision"] = release_revision
    return validate_unsigned(value)


def sign_bundle(unsigned, private_key_bytes):
    """Offline test helper. Never expose private signing keys to Frappe APIs."""
    validate_unsigned(unsigned)
    if not isinstance(private_key_bytes, bytes) or len(private_key_bytes) != 32:
        raise ValueError("Expected 32-byte Ed25519 private seed")
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    signature = Ed25519PrivateKey.from_private_bytes(private_key_bytes).sign(
        canonical_bytes(unsigned))
    return {**unsigned, "signature": base64.b64encode(signature).decode("ascii")}


def verify_bundle(envelope, trusted_keys, expected_league, now=None):
    if not isinstance(envelope, dict):
        raise ValueError("Unexpected signed schedule fields")
    version = envelope.get("schema_version")
    fields = RELEASE_FIELDS if version == 2 else FIELDS
    if set(envelope) != fields | {"signature"}:
        raise ValueError("Unexpected signed schedule fields")
    unsigned = validate_unsigned({key: envelope[key] for key in fields})
    if unsigned["league_id"] != expected_league:
        raise ValueError("Schedule outside requested league")
    if not isinstance(trusted_keys, dict):
        raise ValueError("No trusted schedule keys")
    key = trusted_keys.get(unsigned["key_id"])
    if not isinstance(key, dict) or key.get("issuer") != unsigned["issuer"]:
        raise ValueError("Untrusted schedule issuer")
    if (not isinstance(key.get("leagues"), list)
            or unsigned["league_id"] not in key["leagues"]):
        raise ValueError("Schedule signing key not authorized for league")
    encoded = key.get("public_key_base64")
    if not isinstance(encoded, str):
        raise ValueError("Invalid schedule verification key")
    try:
        public = base64.b64decode(encoded, validate=True)
        signature = base64.b64decode(envelope["signature"], validate=True)
    except (ValueError, TypeError, base64.binascii.Error) as exc:
        raise ValueError("Invalid schedule key or signature encoding") from exc
    if len(public) != 32 or len(signature) != 64:
        raise ValueError("Invalid schedule key or signature length")
    instant = now or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        raise ValueError("Verifier time must be timezone aware")
    instant = instant.astimezone(timezone.utc)
    if instant < _utc(unsigned["issued_at"]) - timedelta(minutes=5):
        raise ValueError("Schedule issued in the future")
    if instant >= _utc(unsigned["expires_at"]):
        raise ValueError("Schedule bundle expired")
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    try:
        Ed25519PublicKey.from_public_bytes(public).verify(
            signature, canonical_bytes(unsigned))
    except (InvalidSignature, ValueError) as exc:
        raise ValueError("Schedule signature verification failed") from exc
    return {"league_id": unsigned["league_id"],
            "release_revision": unsigned.get("release_revision"),
            "bundle_sha256": hashlib.sha256(canonical_bytes(unsigned)).hexdigest(),
            "games": unsigned["games"],
            "expires_at": unsigned["expires_at"]}
