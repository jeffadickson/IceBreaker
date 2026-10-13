'use strict';
// Configurable training definitions and versioned, scope-bound policies.
// Renewal rules live in rows, never in hard-coded database columns.
const crypto=require('node:crypto');
const {validDate}=require('./player-suspensions');
const uid=()=>crypto.randomUUID();
const roles=new Set(['PLAYER','PARENT','GUARDIAN','COACH','MANAGER','VOLUNTEER','OFFICIAL']);
const scopes=new Set(['LEAGUE','TOURNAMENT']);
const modes=new Set(['ONCE','ANNUAL_CALENDAR','ANNUAL_SEASON','ROLLING_DAYS']);
const good=(s,n=160)=>typeof s==='string'&&s.trim().length>0&&s.length<=n;
function init(db){
 db.exec([
  "CREATE TABLE IF NOT EXISTS training_catalog(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',issuer TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS training_policy_versions(id TEXT PRIMARY KEY,training_id TEXT NOT NULL REFERENCES training_catalog(id),scope_type TEXT NOT NULL CHECK(scope_type IN ('LEAGUE','TOURNAMENT')),scope_id TEXT NOT NULL,season_id TEXT NOT NULL DEFAULT '',role TEXT NOT NULL,renewal_mode TEXT NOT NULL CHECK(renewal_mode IN ('ONCE','ANNUAL_CALENDAR','ANNUAL_SEASON','ROLLING_DAYS')),validity_days INTEGER,required INTEGER NOT NULL CHECK(required IN (0,1)),effective_from TEXT NOT NULL,effective_to TEXT,revision INTEGER NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(training_id,scope_type,scope_id,season_id,role,revision),CHECK(effective_to IS NULL OR effective_to>=effective_from))",
  "CREATE INDEX IF NOT EXISTS ix_training_policies ON training_policy_versions(scope_type,scope_id,season_id,role,effective_from)",
  "CREATE TABLE IF NOT EXISTS training_completions_v2(id TEXT PRIMARY KEY,training_id TEXT NOT NULL REFERENCES training_catalog(id),subject_type TEXT NOT NULL CHECK(subject_type IN ('PLAYER','ADULT')),subject_id TEXT NOT NULL,completed_on TEXT NOT NULL,expires_on TEXT,verified_by TEXT NOT NULL,verified_at TEXT NOT NULL,evidence_ref TEXT,revoked_at TEXT,revoked_by TEXT,revocation_reason TEXT)",
  "CREATE INDEX IF NOT EXISTS ix_training_completions ON training_completions_v2(subject_type,subject_id,training_id,completed_on)"
 ].join(';')+';');
}
function audit(db,action,entity,actor,details={}){
 db.prepare('INSERT INTO league_audit VALUES(?,?,?,?,?,?)').run(uid(),new Date().toISOString(),actor,action,entity,JSON.stringify(details));
}
function subjectExists(db,type,id){
 return !!(good(id,120)&&db.prepare(type==='PLAYER'?'SELECT 1 FROM players WHERE id=?':'SELECT 1 FROM player_related_people WHERE id=?').get(id));
}
function createTraining(db,{code,title,description='',issuer='CUSTOM'},actor){
 if(!good(code,80)||!good(title)||typeof description!=='string'||description.length>1000||!good(issuer,100)||!good(actor,120))throw Error('Invalid training definition');
 const id=uid();
 db.prepare('INSERT INTO training_catalog VALUES(?,?,?,?,?,1,?)').run(id,code.trim().toUpperCase(),title.trim(),description,issuer.trim(),new Date().toISOString());
 audit(db,'TRAINING_CATALOG_CREATED',id,actor,{code:code.trim().toUpperCase()});
 return {trainingId:id,code:code.trim().toUpperCase()};
}
function catalog(db){return db.prepare('SELECT id trainingId,code,title,description,issuer,active FROM training_catalog ORDER BY code').all();}
function addPolicy(db,{trainingId,scopeType,scopeId,seasonId='',role,renewalMode='ANNUAL_SEASON',validityDays=null,required=true,effectiveFrom,effectiveTo=null},actor){
 if(!good(actor,120)||!good(trainingId,120)||!scopes.has(scopeType)||!good(scopeId,120)||!roles.has(role)||!modes.has(renewalMode)||typeof required!=='boolean'||!validDate(effectiveFrom)||effectiveTo!==null&&(!validDate(effectiveTo)||effectiveTo<effectiveFrom)||typeof seasonId!=='string'||seasonId.length>100)throw Error('Invalid training policy');
 if(renewalMode==='ROLLING_DAYS'&&(!Number.isInteger(validityDays)||validityDays<1||validityDays>3650))throw Error('Rolling renewal requires validityDays between 1 and 3650');
 if(renewalMode!=='ROLLING_DAYS'&&validityDays!==null)throw Error('validityDays applies only to rolling renewal');
 if(renewalMode==='ANNUAL_SEASON'&&!seasonId)throw Error('Annual season training requires seasonId');
 if(!db.prepare('SELECT 1 FROM training_catalog WHERE id=? AND active=1').get(trainingId))throw Error('Unknown or inactive training');
 if(scopeType==='LEAGUE'&&!db.prepare('SELECT 1 FROM leagues WHERE id=?').get(scopeId))throw Error('Unknown league');
 if(scopeType==='TOURNAMENT'&&!db.prepare('SELECT 1 FROM games WHERE id=?').get(scopeId))throw Error('Unknown tournament game');
 if(seasonId&&!db.prepare('SELECT 1 FROM seasons WHERE id=?').get(seasonId))throw Error('Unknown season');
 if(scopeType==='LEAGUE'&&seasonId&&!db.prepare('SELECT 1 FROM league_seasons WHERE league_id=? AND season_id=?').get(scopeId,seasonId))
  throw Error('Season does not belong to league');
 if(scopeType==='TOURNAMENT'){
  const game=db.prepare('SELECT competition_type type FROM competition_policies WHERE game_id=?').get(scopeId);
  if(!game||game.type!=='TOURNAMENT')throw Error('Tournament policy must be enabled for this game');
 }
 // Revisions are append-only; a later effectiveFrom supersedes earlier
 // revisions for the same course/scope/role. No retroactive rule mutation.
 const previous=db.prepare('SELECT MAX(effective_from) latest FROM training_policy_versions WHERE training_id=? AND scope_type=? AND scope_id=? AND season_id=? AND role=?').get(trainingId,scopeType,scopeId,seasonId,role);
 if(previous.latest&&effectiveFrom<=previous.latest)throw Error('New policy revision must have a later effective date');
 const revision=db.prepare('SELECT COALESCE(MAX(revision),0)+1 n FROM training_policy_versions WHERE training_id=? AND scope_type=? AND scope_id=? AND season_id=? AND role=?').get(trainingId,scopeType,scopeId,seasonId,role).n;
 const id=uid();
 db.prepare('INSERT INTO training_policy_versions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run(id,trainingId,scopeType,scopeId,seasonId,role,renewalMode,validityDays,required?1:0,effectiveFrom,effectiveTo,revision,actor,new Date().toISOString());
 audit(db,'TRAINING_POLICY_CREATED',id,actor,{trainingId,scopeType,scopeId,seasonId,role,renewalMode,revision});
 return {policyId:id,revision};
}
function recordCompletion(db,{trainingId,subjectType,subjectId,completedOn,expiresOn=null,evidenceRef=null},actor){
 if(!good(actor,120)||!['PLAYER','ADULT'].includes(subjectType)||!subjectExists(db,subjectType,subjectId)||!good(trainingId,120)||!db.prepare('SELECT 1 FROM training_catalog WHERE id=?').get(trainingId)||!validDate(completedOn)||expiresOn!==null&&(!validDate(expiresOn)||expiresOn<completedOn)||evidenceRef!==null&&!good(evidenceRef,250))throw Error('Invalid training completion');
 const id=uid();
 db.prepare('INSERT INTO training_completions_v2 VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)')
  .run(id,trainingId,subjectType,subjectId,completedOn,expiresOn,actor,new Date().toISOString(),evidenceRef);
 audit(db,'TRAINING_COMPLETION_VERIFIED',id,actor,{trainingId,subjectType,subjectId});
 return {completionId:id};
}
function revokeCompletion(db,completionId,reason,actor){
 if(!good(actor,120)||!good(reason,300))throw Error('Revocation reason required');
 const row=db.prepare('SELECT subject_id FROM training_completions_v2 WHERE id=? AND revoked_at IS NULL').get(completionId);
 if(!row)throw Error('Completion not found or already revoked');
 db.prepare('UPDATE training_completions_v2 SET revoked_at=?,revoked_by=?,revocation_reason=? WHERE id=?').run(new Date().toISOString(),actor,reason,completionId);
 audit(db,'TRAINING_COMPLETION_REVOKED',completionId,actor,{subjectId:row.subject_id});
 return {completionId,revoked:true};
}
function status(db,{subjectType,subjectId,role,scopeType,scopeId,seasonId='',date}){
 if(!['PLAYER','ADULT'].includes(subjectType)||!subjectExists(db,subjectType,subjectId)||!roles.has(role)||!scopes.has(scopeType)||!good(scopeId,120)||!validDate(date))throw Error('Invalid training status query');
 const candidates=db.prepare("SELECT p.*,c.code,c.title FROM training_policy_versions p JOIN training_catalog c ON c.id=p.training_id WHERE p.scope_type=? AND p.scope_id=? AND (p.season_id='' OR p.season_id=?) AND p.role=? AND p.effective_from<=? AND (p.effective_to IS NULL OR p.effective_to>=?) ORDER BY p.effective_from DESC,p.revision DESC").all(scopeType,scopeId,seasonId,role,date,date);
 // Most recent effective policy wins for each training definition.
 const policies=new Map();
 for(const p of candidates)if(!policies.has(p.training_id))policies.set(p.training_id,p);
 const season=seasonId?db.prepare('SELECT start_date startDate,end_date endDate FROM seasons WHERE id=?').get(seasonId):null;
 return [...policies.values()].map(p=>{
  const completions=db.prepare('SELECT completed_on completedOn,expires_on expiresOn FROM training_completions_v2 WHERE subject_type=? AND subject_id=? AND training_id=? AND revoked_at IS NULL AND completed_on<=? ORDER BY completed_on DESC').all(subjectType,subjectId,p.training_id,date);
  const complete=completions.some(c=>{
   if(c.expiresOn&&c.expiresOn<date)return false;
   if(p.renewal_mode==='ANNUAL_CALENDAR')return c.completedOn.slice(0,4)===date.slice(0,4);
   if(p.renewal_mode==='ANNUAL_SEASON')return !!season&&c.completedOn>=season.startDate&&c.completedOn<=season.endDate;
   if(p.renewal_mode==='ROLLING_DAYS'){
    const age=Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(c.completedOn+'T12:00:00Z'))/86400000);
    return age<=p.validity_days;
   }
   return true;
  });
  return {trainingId:p.training_id,code:p.code,title:p.title,required:!!p.required,complete,eligible:!p.required||complete,renewalMode:p.renewal_mode,policyRevision:p.revision};
 });
}
module.exports={init,createTraining,catalog,addPolicy,recordCompletion,revokeCompletion,status};
