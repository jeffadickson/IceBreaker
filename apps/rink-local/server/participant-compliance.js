'use strict';
// Internal UUID remains authoritative; hockey numbers are encrypted alternate IDs.
const crypto=require('node:crypto');
const {encryptField,decryptField,fieldKey}=require('./private-fields');
const {validDate}=require('./player-suspensions');
const uuid=()=>crypto.randomUUID(),good=(s,n=150)=>typeof s==='string'&&s.trim().length>0&&s.length<=n;
const ROLES=new Set(['PLAYER','PARENT','GUARDIAN','COACH','MANAGER','VOLUNTEER','OFFICIAL']);
const TYPES=new Set(['LEAGUE','TOURNAMENT']);
function indexKey(){
 const raw=process.env.ICEBREAKER_IDENTIFIER_INDEX_KEY_BASE64,b=raw?Buffer.from(raw,'base64'):null;
 if(!b||b.length!==32||b.toString('base64')!==raw)throw Error('Identifier index key required');
 return b;
}
function indexFor(issuer,number,seasonId){
 return crypto.createHmac('sha256',indexKey()).update(JSON.stringify([issuer,number,seasonId])).digest('hex');
}
function init(db){
 db.exec([
  "CREATE TABLE IF NOT EXISTS participant_external_ids(id TEXT PRIMARY KEY,subject_type TEXT NOT NULL CHECK(subject_type IN ('PLAYER','ADULT')),subject_id TEXT NOT NULL,issuer TEXT NOT NULL,season_id TEXT NOT NULL DEFAULT '',identifier_ciphertext TEXT NOT NULL,lookup_hmac TEXT NOT NULL UNIQUE,verified_by TEXT NOT NULL,verified_at TEXT NOT NULL,UNIQUE(subject_type,subject_id,issuer,season_id))",
  "CREATE TABLE IF NOT EXISTS participant_role_assignments(id TEXT PRIMARY KEY,subject_type TEXT NOT NULL CHECK(subject_type IN ('PLAYER','ADULT')),subject_id TEXT NOT NULL,role TEXT NOT NULL,scope_type TEXT NOT NULL CHECK(scope_type IN ('LEAGUE','TOURNAMENT')),scope_id TEXT NOT NULL,season_id TEXT NOT NULL DEFAULT '',UNIQUE(subject_type,subject_id,role,scope_type,scope_id,season_id))",
  "CREATE TABLE IF NOT EXISTS competition_policies(game_id TEXT PRIMARY KEY REFERENCES games(id),competition_type TEXT NOT NULL CHECK(competition_type IN ('LEAGUE','TOURNAMENT')),require_legacy_player_training INTEGER NOT NULL CHECK(require_legacy_player_training IN (0,1)),policy_note TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS competition_training_rules(id TEXT PRIMARY KEY,scope_type TEXT NOT NULL CHECK(scope_type IN ('LEAGUE','TOURNAMENT')),scope_id TEXT NOT NULL,season_id TEXT NOT NULL DEFAULT '',role TEXT NOT NULL,code TEXT NOT NULL,title TEXT NOT NULL,required INTEGER NOT NULL CHECK(required IN (0,1)),UNIQUE(scope_type,scope_id,season_id,role,code))",
  "CREATE TABLE IF NOT EXISTS participant_training_evidence(id TEXT PRIMARY KEY,subject_type TEXT NOT NULL CHECK(subject_type IN ('PLAYER','ADULT')),subject_id TEXT NOT NULL,code TEXT NOT NULL,completed_on TEXT NOT NULL,expires_on TEXT,verified_by TEXT NOT NULL,revoked_at TEXT)",
  "CREATE INDEX IF NOT EXISTS ix_participant_evidence ON participant_training_evidence(subject_type,subject_id,code)"
 ].join(';')+';');
}
function exists(db,type,id){
 if(!['PLAYER','ADULT'].includes(type)||!good(id,120))return false;
 return !!db.prepare(type==='PLAYER'?'SELECT 1 FROM players WHERE id=?':'SELECT 1 FROM player_related_people WHERE id=?').get(id);
}
function audit(db,action,entity,actor,payload={}){
 db.prepare('INSERT INTO league_audit VALUES(?,?,?,?,?,?)').run(uuid(),new Date().toISOString(),actor,action,entity,JSON.stringify(payload));
}
function linkExternalId(db,{subjectType,subjectId,issuer,identifier,seasonId=''},actor){
 if(!exists(db,subjectType,subjectId)||!good(issuer,80)||!good(identifier,120)||!good(actor,120)||typeof seasonId!=='string'||seasonId.length>100)throw Error('Invalid external identifier');
 if(!fieldKey())throw Error('Private-field key required for external identifiers');
 const issuerKey=issuer.trim().toUpperCase(),number=identifier.trim(),id=uuid();
 const token=indexFor(issuerKey,number,seasonId);
 db.prepare('INSERT INTO participant_external_ids VALUES(?,?,?,?,?,?,?,?,?)').run(id,subjectType,subjectId,issuerKey,seasonId,encryptField(number,id,'externalIdentifier'),token,actor,new Date().toISOString());
 audit(db,'EXTERNAL_ID_LINKED',subjectId,actor,{issuer:issuerKey,seasonId,subjectType});
 return {id,subjectType,subjectId,issuer:issuerKey,seasonId};
}
function lookupExternalId(db,{issuer,identifier,seasonId=''}){
 if(!good(issuer,80)||!good(identifier,120))throw Error('Invalid external lookup');
 return db.prepare('SELECT subject_type subjectType,subject_id subjectId,id FROM participant_external_ids WHERE lookup_hmac=?')
  .get(indexFor(issuer.trim().toUpperCase(),identifier.trim(),seasonId))||null;
}
function externalIds(db,type,id){
 if(!exists(db,type,id))throw Error('Unknown subject');
 return db.prepare('SELECT id,issuer,season_id seasonId,identifier_ciphertext encrypted FROM participant_external_ids WHERE subject_type=? AND subject_id=? ORDER BY issuer,season_id').all(type,id)
  .map(x=>({id:x.id,issuer:x.issuer,seasonId:x.seasonId,identifier:decryptField(x.encrypted,x.id,'externalIdentifier')}));
}
function setCompetition(db,{gameId,type,requireLegacyPlayerTraining=null,note},actor){
 if(!good(actor,120)||!good(note,250)||!TYPES.has(type)||!db.prepare('SELECT 1 FROM games WHERE id=?').get(gameId))throw Error('Invalid competition policy');
 const legacy=requireLegacyPlayerTraining===null?type==='LEAGUE':requireLegacyPlayerTraining;
 if(typeof legacy!=='boolean')throw Error('Invalid training policy');
 db.prepare('INSERT INTO competition_policies VALUES(?,?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET competition_type=excluded.competition_type,require_legacy_player_training=excluded.require_legacy_player_training,policy_note=excluded.policy_note,updated_by=excluded.updated_by,updated_at=excluded.updated_at')
  .run(gameId,type,legacy?1:0,note,actor,new Date().toISOString());
 audit(db,'COMPETITION_POLICY_SET',gameId,actor,{type,legacyTrainingRequired:legacy});
 return {gameId,type,requireLegacyPlayerTraining:legacy};
}
function competitionForGame(db,gameId){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='competition_policies'").get())return {type:'LEAGUE',requireLegacyPlayerTraining:true};
 const row=db.prepare('SELECT competition_type type,require_legacy_player_training legacy FROM competition_policies WHERE game_id=?').get(gameId);
 return row?{type:row.type,requireLegacyPlayerTraining:!!row.legacy}:{type:'LEAGUE',requireLegacyPlayerTraining:true};
}
function legacyTrainingRequired(db,gameId){return competitionForGame(db,gameId).requireLegacyPlayerTraining;}
function assignRole(db,{subjectType,subjectId,role,scopeType,scopeId,seasonId=''},actor){
 if(!exists(db,subjectType,subjectId)||!ROLES.has(role)||!TYPES.has(scopeType)||!good(scopeId,120)||!good(actor,120))throw Error('Invalid role assignment');
 if((role==='PLAYER')!==(subjectType==='PLAYER'))throw Error('Role and subject type mismatch');
 const id=uuid();
 db.prepare('INSERT INTO participant_role_assignments VALUES(?,?,?,?,?,?,?)').run(id,subjectType,subjectId,role,scopeType,scopeId,seasonId);
 audit(db,'PARTICIPANT_ROLE_ASSIGNED',subjectId,actor,{role,scopeType,scopeId});return {id};
}
function requireCourse(db,{scopeType,scopeId,seasonId='',role,code,title,required=true},actor){
 if(!TYPES.has(scopeType)||!good(scopeId,120)||!ROLES.has(role)||!good(code,80)||!good(title)||typeof required!=='boolean'||!good(actor,120))throw Error('Invalid training rule');
 const id=uuid();
 db.prepare('INSERT INTO competition_training_rules VALUES(?,?,?,?,?,?,?,?)').run(id,scopeType,scopeId,seasonId,role,code,title,required?1:0);
 audit(db,'ROLE_TRAINING_RULE_SET',id,actor,{scopeType,scopeId,role,code,required});return {id};
}
function recordCourse(db,{subjectType,subjectId,code,completedOn,expiresOn=null},actor){
 if(!exists(db,subjectType,subjectId)||!good(code,80)||!validDate(completedOn)||expiresOn!==null&&(!validDate(expiresOn)||expiresOn<completedOn)||!good(actor,120))throw Error('Invalid training evidence');
 const id=uuid();
 db.prepare('INSERT INTO participant_training_evidence VALUES(?,?,?,?,?,?,?,NULL)').run(id,subjectType,subjectId,code,completedOn,expiresOn,actor);
 audit(db,'PARTICIPANT_TRAINING_VERIFIED',subjectId,actor,{code,subjectType});return {id};
}
function trainingForRole(db,{subjectType,subjectId,role,scopeType,scopeId,seasonId='',date}){
 if(!validDate(date)||!ROLES.has(role)||!TYPES.has(scopeType)||!exists(db,subjectType,subjectId))throw Error('Invalid compliance query');
 return db.prepare("SELECT code,title,required FROM competition_training_rules WHERE scope_type=? AND scope_id=? AND (season_id='' OR season_id=?) AND role=? ORDER BY code")
  .all(scopeType,scopeId,seasonId,role).map(r=>{
   const complete=!!db.prepare('SELECT 1 FROM participant_training_evidence WHERE subject_type=? AND subject_id=? AND code=? AND completed_on<=? AND (expires_on IS NULL OR expires_on>=?) AND revoked_at IS NULL LIMIT 1')
    .get(subjectType,subjectId,r.code,date,date);
   return {code:r.code,title:r.title,required:!!r.required,complete,eligible:!r.required||complete};
  });
}
function gamePlayerTraining(db,playerId,teamId,gameId,date){
 const policy=competitionForGame(db,gameId);
 const legacy=policy.requireLegacyPlayerTraining?
  require('./player-registry').trainingStatus(db,playerId,teamId,date):[];
 const team=db.prepare('SELECT d.season_id seasonId,ls.league_id leagueId FROM teams t JOIN divisions d ON d.id=t.division_id JOIN league_seasons ls ON ls.season_id=d.season_id WHERE t.id=?').get(teamId);
 if(!team)throw Error('Unknown team');
 const scopeType=policy.type,scopeId=scopeType==='TOURNAMENT'?gameId:team.leagueId;
 const extra=trainingForRole(db,{subjectType:'PLAYER',subjectId:playerId,role:'PLAYER',
  scopeType,scopeId,seasonId:scopeType==='LEAGUE'?team.seasonId:'',date});
 return [...legacy,...extra.map(x=>({code:x.code,title:x.title,complete:x.complete,blocksLineup:x.required,requiredBy:null}))];
}
module.exports={init,linkExternalId,lookupExternalId,externalIds,setCompetition,competitionForGame,legacyTrainingRequired,assignRole,requireCourse,recordCourse,trainingForRole,gamePlayerTraining};
