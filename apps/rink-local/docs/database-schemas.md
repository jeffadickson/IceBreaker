# IceBreaker Database Schema Reference

**Source-derived DDL inventory.** These are the schema definitions in the codebase. The exact installed SQLite schema, including `ALTER TABLE` columns, foreign keys and indexes, can be regenerated using [the introspection tool](../tools/schema-catalog.js). No player records or document contents are included.

## Trust boundaries

- **League/rink prototype SQLite:** seasons, teams, schedules, scoring, registration, family, compliance and certification; this development file is not suitable for production private data.
- **Encrypted email evidence SQLite:** separate AES-256-GCM certificate image archive, quarantine status and audit.
- **Central ingest SQLite:** station identities, signed event batches and replay protection; not interchangeable with the rink event journal.
- **C# desktop SQLite:** game authority, outbox, PA announcements and pinned game policy.

## Core relationships

`leagues` → `league_seasons` → `seasons` → `divisions` → `teams` → `roster_memberships` → `players`. `games` link two teams; `goal_attributions` and `certified_goalie_stats` depend on certification. `player_person_links` associate players and adult contacts. `training_catalog` defines courses; `training_policy_versions` defines scope/renewal; `training_completions_v2` holds verified evidence; `training_intake` holds pending claims.

## Schema DDL by owner

### apps/rink-local/server/league-store.js

**`seasons`**

```sql
CREATE TABLE IF NOT EXISTS seasons(id TEXT PRIMARY KEY,name TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL);
```

**`leagues`**

```sql
CREATE TABLE IF NOT EXISTS leagues(id TEXT PRIMARY KEY,name TEXT NOT NULL,public_scoreboard_enabled INTEGER NOT NULL DEFAULT 1 CHECK(public_scoreboard_enabled IN (0,1)),timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles');
```

**`league_seasons`**

```sql
CREATE TABLE IF NOT EXISTS league_seasons(league_id TEXT NOT NULL REFERENCES leagues(id),season_id TEXT NOT NULL REFERENCES seasons(id),PRIMARY KEY(league_id,season_id),UNIQUE(season_id));
```

**`divisions`**

```sql
CREATE TABLE IF NOT EXISTS divisions(id TEXT PRIMARY KEY,season_id TEXT NOT NULL REFERENCES seasons(id),name TEXT NOT NULL,rules_version TEXT NOT NULL);
```

**`division_timing_rules`**

```sql
CREATE TABLE IF NOT EXISTS division_timing_rules(division_id TEXT NOT NULL REFERENCES divisions(id),version TEXT NOT NULL,rules_json TEXT NOT NULL,PRIMARY KEY(division_id,version));
```

**`teams`**

```sql
CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY,division_id TEXT NOT NULL REFERENCES divisions(id),name TEXT NOT NULL,short TEXT NOT NULL,city TEXT NOT NULL,tone TEXT NOT NULL);
```

**`players`**

```sql
CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,display_name TEXT NOT NULL,privacy_status TEXT NOT NULL DEFAULT 'PUBLIC_ALIAS');
```

**`roster_memberships`**

```sql
CREATE TABLE IF NOT EXISTS roster_memberships(season_id TEXT NOT NULL REFERENCES seasons(id),team_id TEXT NOT NULL REFERENCES teams(id),player_id TEXT NOT NULL REFERENCES players(id),jersey INTEGER NOT NULL,position TEXT NOT NULL,PRIMARY KEY(season_id,team_id,player_id));
```

**`games`**

```sql
CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,division_id TEXT NOT NULL REFERENCES divisions(id),date TEXT NOT NULL,venue TEXT NOT NULL,sheet TEXT NOT NULL,home_team_id TEXT NOT NULL REFERENCES teams(id),away_team_id TEXT NOT NULL REFERENCES teams(id),status TEXT NOT NULL CHECK(status IN ('scheduled','live','final')),home_score INTEGER,away_score INTEGER,certified_at TEXT,certified_by TEXT,version INTEGER NOT NULL DEFAULT 0,CHECK(home_team_id<>away_team_id));
```

**`goal_attributions`**

```sql
CREATE TABLE IF NOT EXISTS goal_attributions(id TEXT PRIMARY KEY,game_id TEXT NOT NULL REFERENCES games(id),team_id TEXT NOT NULL REFERENCES teams(id),scorer_id TEXT REFERENCES players(id),assist1_id TEXT REFERENCES players(id),assist2_id TEXT REFERENCES players(id),CHECK(scorer_id IS NULL OR scorer_id<>assist1_id),CHECK(scorer_id IS NULL OR scorer_id<>assist2_id),CHECK(assist1_id IS NULL OR assist2_id IS NULL OR assist1_id<>assist2_id));
```

**`certified_goalie_stats`**

```sql
CREATE TABLE IF NOT EXISTS certified_goalie_stats(game_id TEXT NOT NULL REFERENCES games(id),team_id TEXT NOT NULL REFERENCES teams(id),player_id TEXT NOT NULL REFERENCES players(id),shots_against INTEGER NOT NULL CHECK(shots_against>=0),saves INTEGER NOT NULL CHECK(saves>=0),goals_against INTEGER NOT NULL CHECK(goals_against>=0),PRIMARY KEY(game_id,team_id,player_id),CHECK(shots_against=saves+goals_against));
```

**`league_audit`**

```sql
CREATE TABLE IF NOT EXISTS league_audit(id TEXT PRIMARY KEY,at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,entity_id TEXT NOT NULL,payload_json TEXT NOT NULL);
```

### apps/rink-local/server/player-registry.js

**`player_private_profiles`**

```sql
CREATE TABLE IF NOT EXISTS player_private_profiles(player_id TEXT PRIMARY KEY REFERENCES players(id),legal_name TEXT NOT NULL,birth_date TEXT NOT NULL,address_json TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
```

**`player_related_people`**

```sql
CREATE TABLE IF NOT EXISTS player_related_people(id TEXT PRIMARY KEY,full_name TEXT NOT NULL,email TEXT,phone TEXT);
```

**`player_registration_identifiers`**

```sql
CREATE TABLE IF NOT EXISTS player_registration_identifiers(player_id TEXT NOT NULL REFERENCES players(id),issuer TEXT NOT NULL,identifier TEXT NOT NULL,season_id TEXT REFERENCES seasons(id),PRIMARY KEY(issuer,identifier),UNIQUE(player_id,issuer,season_id));
```

**`player_person_links`**

```sql
CREATE TABLE IF NOT EXISTS player_person_links(player_id TEXT NOT NULL REFERENCES players(id),person_id TEXT NOT NULL REFERENCES player_related_people(id),relationship TEXT NOT NULL CHECK(relationship IN ('PARENT','GUARDIAN','EMERGENCY_CONTACT','OTHER')),PRIMARY KEY(player_id,person_id,relationship));
```

**`season_training_requirements`**

```sql
CREATE TABLE IF NOT EXISTS season_training_requirements(id TEXT PRIMARY KEY,league_id TEXT NOT NULL REFERENCES leagues(id),season_id TEXT NOT NULL REFERENCES seasons(id),code TEXT NOT NULL,title TEXT NOT NULL,required_by TEXT,blocks_lineup INTEGER NOT NULL CHECK(blocks_lineup IN (0,1)),UNIQUE(league_id,season_id,code));
```

**`player_training_completions`**

```sql
CREATE TABLE IF NOT EXISTS player_training_completions(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),requirement_id TEXT NOT NULL REFERENCES season_training_requirements(id),completed_on TEXT NOT NULL,expires_on TEXT,evidence_ref TEXT,verified_by TEXT NOT NULL,verified_at TEXT NOT NULL,revoked_at TEXT,UNIQUE(player_id,requirement_id,completed_on));
```

**`player_membership_history`**

```sql
CREATE TABLE IF NOT EXISTS player_membership_history(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),season_id TEXT NOT NULL REFERENCES seasons(id),team_id TEXT NOT NULL REFERENCES teams(id),joined_at TEXT NOT NULL,left_at TEXT,reason TEXT NOT NULL,actor TEXT NOT NULL);
```

### apps/rink-local/server/registration-portal.js

**`registration_clubs`**

```sql
CREATE TABLE IF NOT EXISTS registration_clubs(id TEXT PRIMARY KEY,name TEXT NOT NULL,league_id TEXT NOT NULL REFERENCES leagues(id));
```

**`registration_club_teams`**

```sql
CREATE TABLE IF NOT EXISTS registration_club_teams(club_id TEXT NOT NULL REFERENCES registration_clubs(id),team_id TEXT NOT NULL REFERENCES teams(id),PRIMARY KEY(club_id,team_id),UNIQUE(team_id));
```

**`registration_player_clubs`**

```sql
CREATE TABLE IF NOT EXISTS registration_player_clubs(club_id TEXT NOT NULL REFERENCES registration_clubs(id),player_id TEXT NOT NULL REFERENCES players(id),created_at TEXT NOT NULL,PRIMARY KEY(club_id,player_id));
```

**`registration_users`**

```sql
CREATE TABLE IF NOT EXISTS registration_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('CLUB_REGISTRAR','LEAGUE_ADMIN')),scope_id TEXT NOT NULL,created_at TEXT NOT NULL);
```

**`registration_sessions`**

```sql
CREATE TABLE IF NOT EXISTS registration_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES registration_users(id),expires_ms INTEGER NOT NULL);
```

**`registration_requests`**

```sql
CREATE TABLE IF NOT EXISTS registration_requests(id TEXT PRIMARY KEY,club_id TEXT NOT NULL REFERENCES registration_clubs(id),league_id TEXT NOT NULL REFERENCES leagues(id),player_id TEXT NOT NULL REFERENCES players(id),team_id TEXT NOT NULL REFERENCES teams(id),jersey INTEGER NOT NULL,position TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('SUBMITTED','APPROVED','REJECTED')),created_by TEXT NOT NULL,created_at TEXT NOT NULL,decided_by TEXT,decided_at TEXT,decision_reason TEXT);
```

**`registration_division_age_rules`**

```sql
CREATE TABLE IF NOT EXISTS registration_division_age_rules(division_id TEXT PRIMARY KEY REFERENCES divisions(id),cutoff_date TEXT NOT NULL,min_age INTEGER NOT NULL,max_age INTEGER NOT NULL,CHECK(min_age>=0 AND max_age>=min_age AND max_age<=99));
```

### apps/rink-local/server/team-accounts.js

**`team_users`**

```sql
CREATE TABLE IF NOT EXISTS team_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL);
```

**`team_members`**

```sql
CREATE TABLE IF NOT EXISTS team_members(user_id TEXT NOT NULL REFERENCES team_users(id),team_id TEXT NOT NULL REFERENCES teams(id),role TEXT NOT NULL CHECK(role IN ('manager','coach','viewer')),PRIMARY KEY(user_id,team_id));
```

**`team_sessions`**

```sql
CREATE TABLE IF NOT EXISTS team_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES team_users(id),expires_ms INTEGER NOT NULL);
```

**`team_roster_revisions`**

```sql
CREATE TABLE IF NOT EXISTS team_roster_revisions(team_id TEXT NOT NULL REFERENCES teams(id),revision INTEGER NOT NULL,at TEXT NOT NULL,actor TEXT NOT NULL,PRIMARY KEY(team_id,revision));
```

**`game_roster_confirmations`**

```sql
CREATE TABLE IF NOT EXISTS game_roster_confirmations(game_id TEXT NOT NULL REFERENCES games(id),team_id TEXT NOT NULL REFERENCES teams(id),roster_revision INTEGER NOT NULL,player_ids_json TEXT NOT NULL,confirmed_by TEXT NOT NULL,confirmed_at TEXT NOT NULL,PRIMARY KEY(game_id,team_id));
```

**`team_roster_audit`**

```sql
CREATE TABLE IF NOT EXISTS team_roster_audit(id TEXT PRIMARY KEY,at TEXT NOT NULL,actor TEXT NOT NULL,team_id TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL);
```

### apps/rink-local/server/participant-compliance.js

**`participant_external_ids`**

```sql
CREATE TABLE IF NOT EXISTS participant_external_ids(id TEXT PRIMARY KEY,subject_type TEXT NOT NULL CHECK(subject_type IN ('PLAYER','ADULT')),subject_id TEXT NOT NULL,issuer TEXT NOT NULL,season_id TEXT NOT NULL DEFAULT '',identifier_ciphertext TEXT NOT NULL,lookup_hmac TEXT NOT NULL UNIQUE,verified_by TEXT NOT NULL,verified_at TEXT NOT NULL,UNIQUE(subject_type,subject_id,issuer,season_id));
```

**`participant_role_assignments`**

```sql
CREATE TABLE IF NOT EXISTS participant_role_assignments(id TEXT PRIMARY KEY,subject_type TEXT NOT NULL CHECK(subject_type IN ('PLAYER','ADULT')),subject_id TEXT NOT NULL,role TEXT NOT NULL,scope_type TEXT NOT NULL CHECK(scope_type IN ('LEAGUE','TOURNAMENT')),scope_id TEXT NOT NULL,season_id TEXT NOT NULL DEFAULT '',UNIQUE(subject_type,subject_id,role,scope_type,scope_id,season_id));
```

**`competition_policies`**

```sql
CREATE TABLE IF NOT EXISTS competition_policies(game_id TEXT PRIMARY KEY REFERENCES games(id),competition_type TEXT NOT NULL CHECK(competition_type IN ('LEAGUE','TOURNAMENT')),require_legacy_player_training INTEGER NOT NULL CHECK(require_legacy_player_training IN (0,1)),policy_note TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL);
```

**`competition_training_rules`**

```sql
CREATE TABLE IF NOT EXISTS competition_training_rules(id TEXT PRIMARY KEY,scope_type TEXT NOT NULL CHECK(scope_type IN ('LEAGUE','TOURNAMENT')),scope_id TEXT NOT NULL,season_id TEXT NOT NULL DEFAULT '',role TEXT NOT NULL,code TEXT NOT NULL,title TEXT NOT NULL,required INTEGER NOT NULL CHECK(required IN (0,1)),UNIQUE(scope_type,scope_id,season_id,role,code));
```

**`participant_training_evidence`**

```sql
CREATE TABLE IF NOT EXISTS participant_training_evidence(id TEXT PRIMARY KEY,subject_type TEXT NOT NULL CHECK(subject_type IN ('PLAYER','ADULT')),subject_id TEXT NOT NULL,code TEXT NOT NULL,completed_on TEXT NOT NULL,expires_on TEXT,verified_by TEXT NOT NULL,revoked_at TEXT);
```

### apps/rink-local/server/training-catalog.js

**`training_catalog`**

```sql
CREATE TABLE IF NOT EXISTS training_catalog(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',issuer TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),created_at TEXT NOT NULL);
```

**`training_policy_versions`**

```sql
CREATE TABLE IF NOT EXISTS training_policy_versions(id TEXT PRIMARY KEY,training_id TEXT NOT NULL REFERENCES training_catalog(id),scope_type TEXT NOT NULL CHECK(scope_type IN ('LEAGUE','TOURNAMENT')),scope_id TEXT NOT NULL,season_id TEXT NOT NULL DEFAULT '',role TEXT NOT NULL,renewal_mode TEXT NOT NULL CHECK(renewal_mode IN ('ONCE','ANNUAL_CALENDAR','ANNUAL_SEASON','ROLLING_DAYS')),validity_days INTEGER,required INTEGER NOT NULL CHECK(required IN (0,1)),effective_from TEXT NOT NULL,effective_to TEXT,revision INTEGER NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(training_id,scope_type,scope_id,season_id,role,revision),CHECK(effective_to IS NULL OR effective_to>=effective_from));
```

**`training_completions_v2`**

```sql
CREATE TABLE IF NOT EXISTS training_completions_v2(id TEXT PRIMARY KEY,training_id TEXT NOT NULL REFERENCES training_catalog(id),subject_type TEXT NOT NULL CHECK(subject_type IN ('PLAYER','ADULT')),subject_id TEXT NOT NULL,completed_on TEXT NOT NULL,expires_on TEXT,verified_by TEXT NOT NULL,verified_at TEXT NOT NULL,evidence_ref TEXT,revoked_at TEXT,revoked_by TEXT,revocation_reason TEXT);
```

### apps/rink-local/server/training-intake.js

**`training_intake`**

```sql
CREATE TABLE IF NOT EXISTS training_intake(id TEXT PRIMARY KEY,source_type TEXT NOT NULL CHECK(source_type IN ('EMAIL','API','MANUAL','BATCH')),source_digest TEXT NOT NULL UNIQUE,training_id TEXT NOT NULL REFERENCES training_catalog(id),subject_type TEXT NOT NULL CHECK(subject_type IN ('PLAYER','ADULT')),subject_id TEXT NOT NULL,completed_on TEXT NOT NULL,expires_on TEXT,evidence_ref TEXT,state TEXT NOT NULL CHECK(state IN ('PENDING','VERIFIED','REJECTED')),imported_by TEXT NOT NULL,imported_at TEXT NOT NULL,reviewed_by TEXT,reviewed_at TEXT,review_note TEXT,completion_id TEXT REFERENCES training_completions_v2(id));
```

### apps/rink-local/server/authority-sqlite.js

**`game_events`**

```sql
CREATE TABLE IF NOT EXISTS game_events (game_id TEXT NOT NULL,seq INTEGER NOT NULL,event_id TEXT NOT NULL UNIQUE,idempotency_key TEXT NOT NULL,event_type TEXT NOT NULL,occurred_at_utc TEXT NOT NULL,actor_id TEXT NOT NULL,period INTEGER NOT NULL,clock_seconds INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(game_id,seq),UNIQUE(game_id,idempotency_key));
```

**`sync_outbox`**

```sql
CREATE TABLE IF NOT EXISTS sync_outbox (event_id TEXT PRIMARY KEY NOT NULL REFERENCES game_events(event_id),game_id TEXT NOT NULL,seq INTEGER NOT NULL,delivered INTEGER NOT NULL DEFAULT 0);
```

**`game_timing_policy`**

```sql
CREATE TABLE IF NOT EXISTS game_timing_policy(game_id TEXT PRIMARY KEY,version TEXT NOT NULL,rules_json TEXT NOT NULL);
```

### apps/rink-local/server/scoresheet-certification.js

**`scoresheet_referees`**

```sql
CREATE TABLE IF NOT EXISTS scoresheet_referees (
  referee_id TEXT PRIMARY KEY, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
```

**`scoresheet_referee_assignments`**

```sql
CREATE TABLE IF NOT EXISTS scoresheet_referee_assignments (
  game_id TEXT NOT NULL,referee_id TEXT NOT NULL REFERENCES scoresheet_referees(referee_id),PRIMARY KEY(game_id,referee_id));
```

**`scoresheet_referee_sessions`**

```sql
CREATE TABLE IF NOT EXISTS scoresheet_referee_sessions (
  token_hash TEXT PRIMARY KEY, referee_id TEXT NOT NULL REFERENCES scoresheet_referees(referee_id), expires_at TEXT NOT NULL);
```

**`scoresheet_revisions`**

```sql
CREATE TABLE IF NOT EXISTS scoresheet_revisions (
  game_id TEXT NOT NULL,revision INTEGER NOT NULL,source_seq INTEGER NOT NULL,document_json TEXT NOT NULL,digest TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('SUBMITTED','CERTIFIED','SUPERSEDED')),submitted_at TEXT NOT NULL,submitted_by TEXT NOT NULL,PRIMARY KEY(game_id,revision));
```

**`scoresheet_signatures`**

```sql
CREATE TABLE IF NOT EXISTS scoresheet_signatures (
  game_id TEXT NOT NULL,revision INTEGER NOT NULL,referee_id TEXT NOT NULL,document_digest TEXT NOT NULL,decision TEXT NOT NULL CHECK(decision IN ('APPROVE','REQUEST_CORRECTION')),reason TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(game_id,revision,referee_id),FOREIGN KEY(game_id,revision) REFERENCES scoresheet_revisions(game_id,revision));
```

### apps/rink-local/server/workflow-runtime.js

**`workflow_instances`**

```sql
CREATE TABLE IF NOT EXISTS workflow_instances(game_id TEXT NOT NULL,workflow_id TEXT NOT NULL,version TEXT NOT NULL,definition_digest TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(game_id,workflow_id));
```

**`workflow_history`**

```sql
CREATE TABLE IF NOT EXISTS workflow_history(game_id TEXT NOT NULL,workflow_id TEXT NOT NULL,seq INTEGER NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,from_state TEXT NOT NULL,to_state TEXT NOT NULL,scoresheet_revision INTEGER,document_digest TEXT,at TEXT NOT NULL,PRIMARY KEY(game_id,workflow_id,seq));
```

**`certification_delivery_outbox`**

```sql
CREATE TABLE IF NOT EXISTS certification_delivery_outbox(delivery_key TEXT PRIMARY KEY,game_id TEXT NOT NULL,scoresheet_revision INTEGER NOT NULL,document_digest TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('LEAGUE_PUBLICATION','PARENT_REPORT')),status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DELIVERED','BLOCKED')),created_at TEXT NOT NULL,delivered_at TEXT,details TEXT);
```

### apps/rink-local/server/certified-delivery.js

**`certified_report_recipients`**

```sql
CREATE TABLE IF NOT EXISTS certified_report_recipients(delivery_key TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(delivery_key,user_id));
```

### apps/rink-local/server/parent-auth.js

**`parent_users`**

```sql
CREATE TABLE IF NOT EXISTS parent_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT,email_verified INTEGER NOT NULL DEFAULT 0,display_name TEXT NOT NULL DEFAULT '',created_ms INTEGER NOT NULL);
```

**`parent_identities`**

```sql
CREATE TABLE IF NOT EXISTS parent_identities(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES parent_users(id),PRIMARY KEY(provider,subject));
```

**`parent_sessions`**

```sql
CREATE TABLE IF NOT EXISTS parent_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES parent_users(id),expires_ms INTEGER NOT NULL);
```

**`parent_tokens`**

```sql
CREATE TABLE IF NOT EXISTS parent_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES parent_users(id),purpose TEXT NOT NULL,expires_ms INTEGER NOT NULL,used_ms INTEGER);
```

**`parent_favorites`**

```sql
CREATE TABLE IF NOT EXISTS parent_favorites(user_id TEXT NOT NULL REFERENCES parent_users(id),kind TEXT NOT NULL,entity_id TEXT NOT NULL,PRIMARY KEY(user_id,kind,entity_id));
```

**`parent_preferences`**

```sql
CREATE TABLE IF NOT EXISTS parent_preferences(user_id TEXT PRIMARY KEY REFERENCES parent_users(id),email_mode TEXT NOT NULL DEFAULT 'certified',include_player_stats INTEGER NOT NULL DEFAULT 1);
```

**`parent_mail_outbox`**

```sql
CREATE TABLE IF NOT EXISTS parent_mail_outbox(id TEXT PRIMARY KEY,recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,created_ms INTEGER NOT NULL,delivered_ms INTEGER);
```

**`parent_oauth_flows`**

```sql
CREATE TABLE IF NOT EXISTS parent_oauth_flows(state_hash TEXT PRIMARY KEY,code_verifier TEXT NOT NULL,nonce TEXT NOT NULL,expires_ms INTEGER NOT NULL);
```

**`parent_auth_attempts`**

```sql
CREATE TABLE IF NOT EXISTS parent_auth_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_ms INTEGER NOT NULL);
```

### apps/rink-local/server/family-access.js

**`family_accounts`**

```sql
CREATE TABLE IF NOT EXISTS family_accounts(id TEXT PRIMARY KEY,person_id TEXT NOT NULL UNIQUE REFERENCES player_related_people(id),email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
```

**`family_sessions`**

```sql
CREATE TABLE IF NOT EXISTS family_sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES family_accounts(id),expires_ms INTEGER NOT NULL);
```

**`family_person_details`**

```sql
CREATE TABLE IF NOT EXISTS family_person_details(person_id TEXT PRIMARY KEY REFERENCES player_related_people(id),private_json TEXT NOT NULL,updated_at TEXT NOT NULL);
```

**`family_grants`**

```sql
CREATE TABLE IF NOT EXISTS family_grants(person_id TEXT NOT NULL REFERENCES player_related_people(id),player_id TEXT NOT NULL REFERENCES players(id),can_view_documents INTEGER NOT NULL DEFAULT 0,can_upload_documents INTEGER NOT NULL DEFAULT 0,verified_at TEXT NOT NULL,verified_by TEXT NOT NULL,revoked_at TEXT,PRIMARY KEY(person_id,player_id));
```

### apps/rink-local/server/encrypted-documents.js

**`private_documents`**

```sql
CREATE TABLE IF NOT EXISTS private_documents(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),document_type TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,digest_sha256 TEXT NOT NULL,wrapped_key BLOB NOT NULL,key_nonce TEXT NOT NULL,key_tag TEXT NOT NULL,data_nonce TEXT NOT NULL,data_tag TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('QUARANTINED','PENDING','VERIFIED','REJECTED','REVOKED')),uploaded_by TEXT NOT NULL,uploaded_at TEXT NOT NULL,verified_by TEXT,verified_at TEXT,decision_note TEXT);
```

### apps/rink-local/server/email-evidence-archive.js

**`archived_evidence`**

```sql
CREATE TABLE IF NOT EXISTS archived_evidence(id TEXT PRIMARY KEY,source_digest TEXT NOT NULL UNIQUE,subject_type TEXT NOT NULL,subject_id TEXT NOT NULL,training_id TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,encrypted_data BLOB NOT NULL,data_nonce TEXT NOT NULL,data_tag TEXT NOT NULL,wrapped_key BLOB NOT NULL,key_nonce TEXT NOT NULL,key_tag TEXT NOT NULL,created_at TEXT NOT NULL);
```

**`evidence_audit`**

```sql
CREATE TABLE IF NOT EXISTS evidence_audit(id TEXT PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,evidence_id TEXT NOT NULL,actor TEXT NOT NULL,details TEXT NOT NULL);
```

### apps/rink-local/server/player-suspensions.js

**`player_suspensions`**

```sql
CREATE TABLE IF NOT EXISTS player_suspensions(
 id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),league_id TEXT NOT NULL REFERENCES leagues(id),
 start_date TEXT NOT NULL,end_date TEXT NOT NULL,reason TEXT NOT NULL,
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 revoked_by TEXT,revoked_at TEXT,revocation_reason TEXT,
 CHECK(start_date<=end_date));
```

### apps/rink-local/server/auxiliary-clock.js

**`auxiliary_clock_state`**

```sql
CREATE TABLE IF NOT EXISTS auxiliary_clock_state(game_id TEXT PRIMARY KEY,phase TEXT NOT NULL,remaining INTEGER NOT NULL,running INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0);
```

**`auxiliary_clock_history`**

```sql
CREATE TABLE IF NOT EXISTS auxiliary_clock_history(game_id TEXT NOT NULL,seq INTEGER NOT NULL,event_id TEXT NOT NULL UNIQUE,action TEXT NOT NULL,phase TEXT NOT NULL,remaining INTEGER NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(game_id,seq));
```

### services/ingest/central-server.js

**`stations`**

```sql
CREATE TABLE IF NOT EXISTS stations(id TEXT PRIMARY KEY, public_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
```

**`assignments`**

```sql
CREATE TABLE IF NOT EXISTS assignments(game_id TEXT NOT NULL, station_id TEXT NOT NULL REFERENCES stations(id), PRIMARY KEY(game_id,station_id));
```

**`game_owners`**

```sql
CREATE TABLE IF NOT EXISTS game_owners(game_id TEXT PRIMARY KEY, station_id TEXT NOT NULL REFERENCES stations(id), epoch INTEGER NOT NULL DEFAULT 1);
```

**`game_events`**

```sql
CREATE TABLE IF NOT EXISTS game_events(game_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL, station_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, digest TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY(game_id,seq), UNIQUE(game_id,event_id));
```

**`ingestion_audit`**

```sql
CREATE TABLE IF NOT EXISTS ingestion_audit(id INTEGER PRIMARY KEY AUTOINCREMENT, happened_at TEXT NOT NULL, action TEXT NOT NULL, game_id TEXT, station_id TEXT, detail TEXT);
```

### apps/rink-local/src/Icebreaker.Core/GameStore.cs

**`game_events`**

```sql
CREATE TABLE IF NOT EXISTS game_events (
              game_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL UNIQUE,
              idempotency_key TEXT NOT NULL, event_type TEXT NOT NULL,
              occurred_at_utc TEXT NOT NULL, actor_id TEXT NOT NULL,
              period INTEGER NOT NULL, clock_seconds INTEGER NOT NULL,
              payload_json TEXT NOT NULL,
              PRIMARY KEY(game_id, seq), UNIQUE(game_id, idempotency_key)
            );
```

**`sync_outbox`**

```sql
CREATE TABLE IF NOT EXISTS sync_outbox (
              event_id TEXT PRIMARY KEY NOT NULL REFERENCES game_events(event_id),
              game_id TEXT NOT NULL, seq INTEGER NOT NULL, delivered INTEGER NOT NULL DEFAULT 0
            );
```

### apps/rink-local/src/Icebreaker.Core/Integration/AnnouncementOutbox.cs

**`announcement_outbox`**

```sql
CREATE TABLE IF NOT EXISTS announcement_outbox (
              announcement_id TEXT PRIMARY KEY,
              game_id TEXT NOT NULL,
              source_seq INTEGER NULL,
              kind TEXT NOT NULL,
              script TEXT NOT NULL,
              requires_approval INTEGER NOT NULL,
              state TEXT NOT NULL,
              created_at_utc TEXT NOT NULL
            );
```

### apps/rink-local/src/Icebreaker.Core/Integration/GamePolicyPin.cs

**`game_policy`**

```sql
CREATE TABLE IF NOT EXISTS game_policy (
                  game_id TEXT PRIMARY KEY, policy_json TEXT NOT NULL
                );
```

### services/elsa-workflows/bridge-outbox.js (optional legacy integration)

**`elsa_bridge_outbox`**

```sql
CREATE TABLE IF NOT EXISTS elsa_bridge_outbox(
  event_id TEXT PRIMARY KEY, game_id TEXT NOT NULL, action TEXT NOT NULL,
  revision INTEGER NOT NULL, definition_digest TEXT NOT NULL, state TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DELIVERED')),
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, delivered_at TEXT
);
```

## Exact installed schema, including migrations and indexes

The source excerpts above are a reviewable catalog, not a migration mechanism. The authoritative installed schema is obtained by **read-only introspection** of the actual SQLite file. This captures `ALTER TABLE` columns (for example registration MFA fields), composite primary keys, indexes, unique constraints, and foreign keys.

To regenerate a comprehensive reference from **three fresh fictional databases** (rink/league, central ingest, encrypted email archive):

```bash
node apps/rink-local/tools/generate-schema-reference.js \
  --out apps/rink-local/docs/database-schema-generated.md
```

To inspect an existing SQLite database without modifying it:

```bash
node apps/rink-local/tools/schema-catalog.js \
  --db /path/to/league.sqlite "League / rink" \
  --db /path/to/central.sqlite "Central ingest" \
  --db /path/to/evidence.sqlite "Encrypted evidence" \
  --out schema-reference.md
```

**Do not commit database files or encryption keys.** The generated report includes DDL only, not user records. The generator uses fictional fixtures, never the production database. C#-only SQLite tables are listed above because the Node fixture generator does not instantiate .NET classes.

## Data classification and ownership

| Classification | Examples | Access policy |
|---|---|---|
| Public or pseudonymous game data | Team aliases, scores, goal/assist attribution, standings | Public scoreboard policy |
| Internal game operations | `game_events`, `sync_outbox`, `scoresheet_signatures`, timing rules | Timekeeper/referee and central sync roles |
| Sensitive personal information | `player_private_profiles`, `player_related_people`, `family_person_details` | Verified guardian/registrar scope only |
| Credentials and sessions | `registration_users`, `team_users`, `parent_sessions`, `family_sessions` | Authentication services only |
| Training/eligibility | `training_completions_v2`, `training_intake`, `player_suspensions` | Authorized league and compliance officers |
| Highly sensitive documents | `private_documents`, `archived_evidence` | Encrypted vault, malware quarantine, audited verification |

The current prototype places several domains in one SQLite file. This is **not a production trust boundary**. The planned central registration service must separate private records from rink laptops.

## Schema-change and compatibility checklist

1. Preserve permanent person IDs across seasons, transfers, and tournaments. Federation registration numbers are optional encrypted alternate identifiers.
2. Version training policy rows instead of altering schema each season. Keep the older training tables readable until migration.
3. Enforce foreign keys, transactional writes, unique event IDs, idempotency keys, and immutable certified revisions.
4. Ensure published league statistics derive only from certified results. Pending games must never contribute.
5. Validate multi-division and multi-season isolation, including roster, standings, and goalie statistics.
6. Keep encrypted document blobs outside public game/event databases. Never put certificates in Git.
7. Run `node --test apps/rink-local/tests/browser/schema-reference.test.js`, the 56-game season simulation, and full CI after every schema change.

