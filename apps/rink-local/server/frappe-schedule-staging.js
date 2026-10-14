'use strict';
// Isolated, schedule-only staging cache. Never modifies the official game,
// clock, event journal, scores, or roster.
const {verifyFrappeSchedule,canonical}=require('./frappe-schedule-verifier');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$/;
function init(db){
 db.exec([
  "CREATE TABLE IF NOT EXISTS frappe_schedule_highwater (league_id TEXT PRIMARY KEY,release_revision INTEGER NOT NULL CHECK(release_revision>0),bundle_sha256 TEXT NOT NULL,accepted_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS frappe_schedule_staged (league_id TEXT NOT NULL,release_revision INTEGER NOT NULL,bundle_sha256 TEXT NOT NULL,issued_at TEXT NOT NULL,expires_at TEXT NOT NULL,games_json TEXT NOT NULL,accepted_at TEXT NOT NULL,PRIMARY KEY(league_id,release_revision))",
  "CREATE INDEX IF NOT EXISTS ix_frappe_staged_league ON frappe_schedule_staged(league_id,release_revision)"
 ].join(';')+';');
}
function stageSignedSchedule(db,bundle,trust,expectedLeague,{now=Date.now()}={}){
 // Authenticate and validate the complete envelope BEFORE opening a write transaction.
 const verified=verifyFrappeSchedule(bundle,trust,expectedLeague,{now});
 if(verified.releaseRevision===null)throw Error('Unversioned v1 schedule cannot be staged');
 const revision=verified.releaseRevision;
 db.exec('BEGIN IMMEDIATE');
 try{
  const previous=db.prepare('SELECT release_revision revision,bundle_sha256 digest FROM frappe_schedule_highwater WHERE league_id=?').get(expectedLeague);
  if(previous&&revision<previous.revision)throw Error('Schedule rollback rejected');
  if(previous&&revision===previous.revision){
   if(previous.digest!==verified.bundleSha256)throw Error('Conflicting schedule at accepted revision');
   db.exec('COMMIT');
   return {status:'duplicate',leagueId:expectedLeague,releaseRevision:revision,
    bundleSha256:verified.bundleSha256,gameCount:verified.gameCount};
  }
  // Only a separate operator-approved workflow may activate staged schedules.
  const acceptedAt=new Date(now).toISOString();
  db.prepare('INSERT INTO frappe_schedule_staged(league_id,release_revision,bundle_sha256,issued_at,expires_at,games_json,accepted_at) VALUES(?,?,?,?,?,?,?)')
   .run(expectedLeague,revision,verified.bundleSha256,bundle.issued_at,bundle.expires_at,
    canonical(bundle.games),acceptedAt);
  db.prepare('INSERT INTO frappe_schedule_highwater(league_id,release_revision,bundle_sha256,accepted_at) VALUES(?,?,?,?) ON CONFLICT(league_id) DO UPDATE SET release_revision=excluded.release_revision,bundle_sha256=excluded.bundle_sha256,accepted_at=excluded.accepted_at')
   .run(expectedLeague,revision,verified.bundleSha256,acceptedAt);
  db.exec('COMMIT');
  return {status:'staged',leagueId:expectedLeague,releaseRevision:revision,
   bundleSha256:verified.bundleSha256,gameCount:verified.gameCount};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
function latestStaged(db,leagueId){
 if(typeof leagueId!=='string'||!ID.test(leagueId))throw Error('Invalid league');
 const row=db.prepare('SELECT s.release_revision revision,s.bundle_sha256 digest,s.expires_at expiresAt,s.games_json gamesJson FROM frappe_schedule_staged s JOIN frappe_schedule_highwater h ON h.league_id=s.league_id AND h.release_revision=s.release_revision WHERE s.league_id=?').get(leagueId);
 return row?{releaseRevision:row.revision,bundleSha256:row.digest,expiresAt:row.expiresAt,
  games:JSON.parse(row.gamesJson)}:null;
}
function openStagingDatabase(filename){
 if(typeof filename!=='string'||!filename||filename===':memory:')
  throw Error('Separate persistent staging database path required');
 const full=path.resolve(filename);
 if(!fs.existsSync(path.dirname(full)))throw Error('Staging directory does not exist');
 const db=new DatabaseSync(full);
 try{
  // Refuse an accidental --staging-db pointing to the authoritative rink
  // database. The stage cache must never share the game's SQLite file.
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('games','game_events','event_journal','league_audit')").all();
  if(tables.length)throw Error('Refusing authoritative game database as schedule staging cache');
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
  init(db);
  return db;
 }catch(error){db.close();throw error;}
}
module.exports={init,stageSignedSchedule,latestStaged,openStagingDatabase};
