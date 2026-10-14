"""M3 strict signed result envelope. No private records, live clock or mutable scores."""
import base64
import hashlib
import json
import re
from datetime import datetime, timezone

FIELDS = frozenset({
    "schema_version", "fictional", "league_id", "game_id", "revision",
    "home_score", "away_score", "journal_sha256", "certification_sha256",
    "issued_at", "issuer", "key_id", "idempotency_key",
})
IDENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{1,99}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
TOKEN = re.compile(r"[A-Za-z0-9_-]{16,100}\Z")


def canonical_bytes(unsigned):
    return json.dumps(unsigned, sort_keys=True, separators=(",", ":"), ensure_ascii=True,
                      allow_nan=False).encode("ascii")


def decode_envelope(value):
    if isinstance(value, str):
        if len(value.encode("utf-8")) > 4096:
            raise ValueError("Result envelope too large")
        value = json.loads(value)
    if not isinstance(value, dict) or set(value) != FIELDS | {"signature"}:
        raise ValueError("Unexpected result envelope structure")
    unsigned = {k: value[k] for k in FIELDS}
    if type(unsigned["schema_version"]) is not int or unsigned["schema_version"] != 3:
        raise ValueError("Unsupported result schema")
    if unsigned["fictional"] is not True:
        raise ValueError("Pilot accepts fictional results only")
    for field in ("league_id", "game_id", "issuer", "key_id"):
        if not isinstance(unsigned[field], str) or not IDENT.fullmatch(unsigned[field]):
            raise ValueError("Invalid result identifier")
    for field in ("journal_sha256", "certification_sha256"):
        if not isinstance(unsigned[field], str) or not HEX64.fullmatch(unsigned[field]):
            raise ValueError("Invalid result digest")
    for field in ("revision", "home_score", "away_score"):
        number = unsigned[field]
        if type(number) is not int or number < (1 if field == "revision" else 0) or number > 1000000:
            raise ValueError("Invalid result revision or score")
    if not isinstance(unsigned["idempotency_key"], str) or not TOKEN.fullmatch(unsigned["idempotency_key"]):
        raise ValueError("Invalid idempotency key")
    stamp = unsigned["issued_at"]
    if not isinstance(stamp, str) or len(stamp) > 35:
        raise ValueError("Invalid issued timestamp")
    try:
        issued = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Invalid issued timestamp") from exc
    if issued.tzinfo is None or issued.utcoffset() != timezone.utc.utcoffset(issued):
        raise ValueError("Issued timestamp must be UTC")
    signature = value["signature"]
    if not isinstance(signature, str) or len(signature) != 88:
        raise ValueError("Invalid result signature")
    try:
        raw = base64.b64decode(signature, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise ValueError("Invalid result signature") from exc
    if len(raw) != 64 or base64.b64encode(raw).decode("ascii") != signature:
        raise ValueError("Invalid result signature")
    return unsigned, raw


def verify_envelope(value, trusted_public_keys):
    """Ed25519 verification with issuer-bound, pinned public keys."""
    unsigned, signature = decode_envelope(value)
    if not isinstance(trusted_public_keys, dict):
        raise ValueError("No trusted result signing keys configured")
    entry = trusted_public_keys.get(unsigned["key_id"])
    if not isinstance(entry, dict) or entry.get("issuer") != unsigned["issuer"]:
        raise ValueError("Untrusted result signing issuer or key")
    leagues = entry.get("leagues")
    if not isinstance(leagues, list) or unsigned["league_id"] not in leagues:
        raise ValueError("Signing key is not authorized for this league")
    key_b64 = entry.get("public_key_base64")
    if not isinstance(key_b64, str):
        raise ValueError("Invalid configured signing key")
    try:
        key_bytes = base64.b64decode(key_b64, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise ValueError("Invalid configured signing key") from exc
    if len(key_bytes) != 32:
        raise ValueError("Invalid configured signing key")
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    try:
        Ed25519PublicKey.from_public_bytes(key_bytes).verify(signature, canonical_bytes(unsigned))
    except (InvalidSignature, ValueError) as exc:
        raise ValueError("Result signature verification failed") from exc
    return {**unsigned, "envelope_sha256": hashlib.sha256(canonical_bytes(unsigned)).hexdigest(),
            "signature": value["signature"]}


def classify_revision(existing, latest_revision, incoming):
    """Append-only revision policy: exact duplicate, conflict, gap or insert."""
    if existing is not None:
        return "duplicate" if (existing["envelope_sha256"] == incoming["envelope_sha256"]
                               and existing["idempotency_key"] == incoming["idempotency_key"]) else "conflict"
    if incoming["revision"] != latest_revision + 1:
        return "out_of_order"
    return "insert"
