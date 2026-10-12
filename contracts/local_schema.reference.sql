-- Icebreaker local SQLite STARTER schema; migration IDs, FKs and normalization require review.
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS games (
 game_id TEXT PRIMARY KEY, rule_profile_id TEXT NOT NULL,
 rule_profile_version TEXT NOT NULL, state TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0), updated_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS game_events (
 game_id TEXT NOT NULL REFERENCES games(game_id), seq INTEGER NOT NULL CHECK(seq >= 1),
 event_id TEXT NOT NULL UNIQUE, schema_version INTEGER NOT NULL CHECK(schema_version >= 1),
 event_type TEXT NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 committed_utc TEXT NOT NULL,
 PRIMARY KEY(game_id, seq)
);
CREATE TABLE IF NOT EXISTS outbox (
 outbox_id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE REFERENCES game_events(event_id),
 status TEXT NOT NULL CHECK(status IN ('PENDING','ACKED','QUARANTINED')),
 attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0), next_attempt_utc TEXT
);
CREATE TABLE IF NOT EXISTS inbox (
 object_type TEXT NOT NULL, object_id TEXT NOT NULL, revision INTEGER NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 PRIMARY KEY(object_type, object_id)
);
CREATE TABLE IF NOT EXISTS roster_snapshots (
 game_id TEXT NOT NULL REFERENCES games(game_id), team_id TEXT NOT NULL,
 roster_version INTEGER NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 PRIMARY KEY(game_id, team_id)
);
CREATE TABLE IF NOT EXISTS device_settings (
 key TEXT PRIMARY KEY, value_json TEXT NOT NULL CHECK(json_valid(value_json))
);
CREATE TABLE IF NOT EXISTS sync_checkpoint (
 scope TEXT PRIMARY KEY, remote_version INTEGER NOT NULL, updated_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_local (
 audit_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
 reason TEXT, occurred_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_outbox_status ON outbox(status, next_attempt_utc);
