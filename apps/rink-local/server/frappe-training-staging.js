'use strict';
// M4.2: authenticated, fictional-only, policy-only staging. NEVER changes
// official game clock, roster, eligibility, event journal or completions.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
const {verifyFrappeTrainingBundle}=require('./frappe-training-verifier');
const {canonical}=require('./frappe-schedule-verifier');
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$/;
function init(db){
 db.exec([
  "CREATE TABLE IF NOT EXISTS frappe_training_highwater(league_id TEXT PRIMARY KEY,release_revision INTEGER NOT NULL CHECK(release_revision>0),bundle_sha256 TEXT NOT NULL,accepted_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS frappe_training_staged(league_id TEXT NOT NULL,release_revision INTEGER NOT NULL CHECK(release_revision>0),bundle_sha256 TEXT NOT NULL,issued_at TEXT NOT NULL,expires_at TEXT NOT NULL,policies_json TEXT NOT NULL,accepted_at TEXT NOT NULL,PRIMARY KEY(league_id,release_revision))",
  "CREATE INDEX IF NOT EXISTS ix_frappe_training_staged_league ON frappe_training_staged(league_id,release_revision)"
 ].join(';')+';');
}
function stageSignedTraining(db,bundle,trust,leagueId,{now=Date.now()}={}){
 if(typeof leagueId!=='string'||!ID.test(leagueId))throw Error('Invalid expected league');
 // Full authentication, field allowlist, key pinning, and expiry verification
 // before opening a write transaction. The cache never activates the policy.
 const verified=verifyFrappeTrainingBundle(bundle,trust,leagueId,{now});
 const revision=verified.releaseRevision;
 db.exec('BEGIN IMMEDIATE');
 try{
  const previous=db.prepare('SELECT release_revision revision,bundle_sha256 digest FROM frappe_training_highwater WHERE league_id=?').get(leagueId);
  if(previous&&revision<previous.revision)throw Error('Training policy rollback rejected');
  if(previous&&revision===previous.revision){
   if(previous.digest!==verified.bundleSha256)throw Error('Conflicting training policy at accepted revision');
   db.exec('COMMIT');
   return {status:'duplicate',leagueId,releaseRevision:revision,bundleSha256:verified.bundleSha256,policyCount:verified.policyCount};
  }
  const acceptedAt=new Date(now).toISOString();
  db.prepare('INSERT INTO frappe_training_staged(league_id,release_revision,bundle_sha256,issued_at,expires_at,policies_json,accepted_at) VALUES(?,?,?,?,?,?,?)')
   .run(leagueId,revision,verified.bundleSha256,bundle.issued_at,bundle.expires_at,
    canonical(bundle.policies),acceptedAt);
  db.prepare('INSERT INTO frappe_training_highwater(league_id,release_revision,bundle_sha256,accepted_at) VALUES(?,?,?,?) ON CONFLICT(league_id) DO UPDATE SET release_revision=excluded.release_revision,bundle_sha256=excluded.bundle_sha256,accepted_at=excluded.accepted_at')
   .run(leagueId,revision,verified.bundleSha256,acceptedAt);
  db.exec('COMMIT');
  return {status:'staged',leagueId,releaseRevision:revision,bundleSha256:verified.bundleSha256,policyCount:verified.policyCount};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
function latestStagedTraining(db,leagueId){
 if(typeof leagueId!=='string'||!ID.test(leagueId))throw Error('Invalid league');
 const row=db.prepare('SELECT s.release_revision revision,s.bundle_sha256 digest,s.issued_at issuedAt,s.expires_at expiresAt,s.policies_json policiesJson FROM frappe_training_staged s JOIN frappe_training_highwater h ON h.league_id=s.league_id AND h.release_revision=s.release_revision WHERE s.league_id=?').get(leagueId);
 return row?{releaseRevision:row.revision,bundleSha256:row.digest,issuedAt:row.issuedAt,expiresAt:row.expiresAt,
  policies:JSON.parse(row.policiesJson)}:null;
}
function openTrainingStagingDatabase(filename){
 if(typeof filename!=='string'||!filename||filename===':memory:')throw Error('Separate persistent training staging database path required');
 const full=path.resolve(filename);
 if(!fs.existsSync(path.dirname(full)))throw Error('Training staging directory does not exist');
 // Refuse symlink to avoid accidentally aliasing the official game database.
 if(fs.existsSync(full)&&fs.lstatSync(full).isSymbolicLink())throw Error('Symlink staging database refused');
 const db=new DatabaseSync(full);
 try{
  const forbidden=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('games','game_events','event_journal','league_audit','training_completions_v2','player_private_profiles','roster_memberships')").all();
  if(forbidden.length)throw Error('Refusing authoritative or private registration database as training staging cache');
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
  init(db);
  return db;
 }catch(error){db.close();throw error;}
}
module.exports={init,stageSignedTraining,latestStagedTraining,openTrainingStagingDatabase};
