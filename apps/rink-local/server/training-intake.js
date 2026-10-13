'use strict';
// Staged, idempotent intake for externally supplied training certificates.
// Parsing an email or receiving a PDF never proves that training is valid.
const crypto=require('node:crypto');
const {validDate}=require('./player-suspensions');
const training=require('./training-catalog');
const uid=()=>crypto.randomUUID();
const good=(s,n=160)=>typeof s==='string'&&s.trim().length>0&&s.length<=n;
const sources=new Set(['EMAIL','API','MANUAL','BATCH']);
function sourceKey(){
 const raw=process.env.ICEBREAKER_INGEST_HMAC_KEY_BASE64;
 const key=raw?Buffer.from(raw,'base64'):null;
 if(!key||key.length!==32||key.toString('base64')!==raw)
  throw Error('A 32-byte ICEBREAKER_INGEST_HMAC_KEY_BASE64 is required');
 return key;
}
function sourceDigest(sourceType,sourceId){return crypto.createHmac('sha256',sourceKey()).update(JSON.stringify([sourceType,sourceId])).digest('hex');}
function init(db){
 db.exec([
 "CREATE TABLE IF NOT EXISTS training_intake(id TEXT PRIMARY KEY,source_type TEXT NOT NULL CHECK(source_type IN ('EMAIL','API','MANUAL','BATCH')),source_digest TEXT NOT NULL UNIQUE,training_id TEXT NOT NULL REFERENCES training_catalog(id),subject_type TEXT NOT NULL CHECK(subject_type IN ('PLAYER','ADULT')),subject_id TEXT NOT NULL,completed_on TEXT NOT NULL,expires_on TEXT,evidence_ref TEXT,state TEXT NOT NULL CHECK(state IN ('PENDING','VERIFIED','REJECTED')),imported_by TEXT NOT NULL,imported_at TEXT NOT NULL,reviewed_by TEXT,reviewed_at TEXT,review_note TEXT,completion_id TEXT REFERENCES training_completions_v2(id))",
 "CREATE INDEX IF NOT EXISTS ix_training_intake_state ON training_intake(state,imported_at)"
 ].join(';')+';');
}
function audit(db,action,id,actor,details={}){
 db.prepare('INSERT INTO league_audit VALUES(?,?,?,?,?,?)').run(uid(),new Date().toISOString(),actor,action,id,JSON.stringify(details));
}
function tx(db,fn){
 db.exec('BEGIN IMMEDIATE');
 try{const result=fn();db.exec('COMMIT');return result;}
 catch(e){db.exec('ROLLBACK');throw e;}
}
function stage(db,{sourceType,sourceId,trainingId,subjectType,subjectId,completedOn,expiresOn=null,evidenceRef=null},actor){
 if(!good(actor,120)||!sources.has(sourceType)||!good(sourceId,300)||!good(trainingId,120)||
 !['PLAYER','ADULT'].includes(subjectType)||!good(subjectId,120)||!validDate(completedOn)||
 expiresOn!==null&&(!validDate(expiresOn)||expiresOn<completedOn)||
 evidenceRef!==null&&!good(evidenceRef,250))throw Error('Invalid training intake');
 if(!db.prepare('SELECT 1 FROM training_catalog WHERE id=?').get(trainingId))throw Error('Unknown training course');
 const subjectTable=subjectType==='PLAYER'?'players':'player_related_people';
 if(!db.prepare('SELECT 1 FROM '+subjectTable+' WHERE id=?').get(subjectId))
  throw Error('Unknown participant: manual identity reconciliation required');
 const digest=sourceDigest(sourceType,sourceId);
 return tx(db,()=>{
  const previous=db.prepare('SELECT * FROM training_intake WHERE source_digest=?').get(digest);
  if(previous){
   if(previous.training_id!==trainingId||previous.subject_type!==subjectType||previous.subject_id!==subjectId||
      previous.completed_on!==completedOn||previous.expires_on!==expiresOn||previous.evidence_ref!==evidenceRef)
    throw Error('Source ID already used for different certificate data');
   return {intakeId:previous.id,state:previous.state,duplicate:true,completionId:previous.completion_id};
  }
  const id=uid();
  db.prepare("INSERT INTO training_intake(id,source_type,source_digest,training_id,subject_type,subject_id,completed_on,expires_on,evidence_ref,state,imported_by,imported_at) VALUES(?,?,?,?,?,?,?,?,?,'PENDING',?,?)")
   .run(id,sourceType,digest,trainingId,subjectType,subjectId,completedOn,expiresOn,evidenceRef,actor,new Date().toISOString());
  audit(db,'TRAINING_INTAKE_STAGED',id,actor,{sourceType,trainingId,subjectType,subjectId});
  return {intakeId:id,state:'PENDING',duplicate:false};
 });
}
function list(db,{state='PENDING',limit=100}={}){
 if(!['PENDING','VERIFIED','REJECTED','ALL'].includes(state)||!Number.isInteger(limit)||limit<1||limit>500)
  throw Error('Invalid intake filter');
 const fields='id intakeId,source_type sourceType,training_id trainingId,subject_type subjectType,subject_id subjectId,completed_on completedOn,expires_on expiresOn,evidence_ref evidenceRef,state,imported_at importedAt,reviewed_at reviewedAt,completion_id completionId';
 return state==='ALL'?
  db.prepare('SELECT '+fields+' FROM training_intake ORDER BY imported_at DESC,id DESC LIMIT ?').all(limit):
  db.prepare('SELECT '+fields+' FROM training_intake WHERE state=? ORDER BY imported_at DESC,id DESC LIMIT ?').all(state,limit);
}
function decide(db,intakeId,{decision,reviewer,note}){
 if(!good(intakeId,120)||!['VERIFIED','REJECTED'].includes(decision)||!good(reviewer,120)||!good(note,300))
  throw Error('Decision requires an identified reviewer and reason');
 return tx(db,()=>{
  const row=db.prepare('SELECT * FROM training_intake WHERE id=?').get(intakeId);
  if(!row)throw Error('Intake not found');
  if(row.state!=='PENDING')throw Error('Intake already reviewed');
  let completionId=null;
  if(decision==='VERIFIED'){
   // This is the only path by which an intake record becomes eligibility evidence.
   const result=training.recordCompletion(db,{
    trainingId:row.training_id,subjectType:row.subject_type,subjectId:row.subject_id,
    completedOn:row.completed_on,expiresOn:row.expires_on,evidenceRef:row.evidence_ref
   },reviewer);
   completionId=result.completionId;
  }
  const result=db.prepare("UPDATE training_intake SET state=?,reviewed_by=?,reviewed_at=?,review_note=?,completion_id=? WHERE id=? AND state='PENDING'")
   .run(decision,reviewer,new Date().toISOString(),note.trim(),completionId,intakeId);
  if(result.changes!==1)throw Error('Concurrent intake decision');
  audit(db,'TRAINING_INTAKE_'+decision,intakeId,reviewer,{completionId});
  return {intakeId,state:decision,completionId};
 });
}
module.exports={init,stage,list,decide,sourceDigest};
