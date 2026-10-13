'use strict';
// Separate encrypted SQLite evidence archive, not a Git repository.
// Only an opaque reference enters the league registration database.
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {seal,open,keyFromEnvironment,signatureOk,MAX_BYTES}=require('./encrypted-documents');
const uuid=()=>crypto.randomUUID();
class EvidenceArchive{
 constructor(file){
  this.file=path.resolve(file);
  fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(this.file);
  this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL");
  this.db.exec([
   "CREATE TABLE IF NOT EXISTS archived_evidence(id TEXT PRIMARY KEY,source_digest TEXT NOT NULL UNIQUE,subject_type TEXT NOT NULL,subject_id TEXT NOT NULL,training_id TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,encrypted_data BLOB NOT NULL,data_nonce TEXT NOT NULL,data_tag TEXT NOT NULL,wrapped_key BLOB NOT NULL,key_nonce TEXT NOT NULL,key_tag TEXT NOT NULL,created_at TEXT NOT NULL)",
   "CREATE TABLE IF NOT EXISTS evidence_audit(id TEXT PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,evidence_id TEXT NOT NULL,actor TEXT NOT NULL,details TEXT NOT NULL)"
  ].join(';')+';');
  const cols=this.db.prepare('PRAGMA table_info(archived_evidence)').all().map(x=>x.name);
  if(!cols.includes('scan_state'))this.db.exec("ALTER TABLE archived_evidence ADD COLUMN scan_state TEXT NOT NULL DEFAULT 'QUARANTINED' CHECK(scan_state IN ('QUARANTINED','CLEAN','REJECTED'))");
 }
 audit(action,id,actor,details={}){
  this.db.prepare('INSERT INTO evidence_audit VALUES(?,?,?,?,?,?)').run(uuid(),new Date().toISOString(),action,id,actor,JSON.stringify(details));
 }
 lookup(digest){
  return this.db.prepare('SELECT id,source_digest,subject_type,subject_id,training_id,sha256 FROM archived_evidence WHERE source_digest=?').get(digest);
 }
 store({sourceDigest,subjectType,subjectId,trainingId,mime,bytes},actor){
  if(!/^[a-f0-9]{64}$/.test(sourceDigest)||!['PLAYER','ADULT'].includes(subjectType)||
   typeof subjectId!=='string'||subjectId.length>120||typeof trainingId!=='string'||trainingId.length>120||
   !Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>MAX_BYTES||!signatureOk(mime,bytes)||
   typeof actor!=='string'||!actor.trim())throw Error('Invalid evidence archive record');
  const checksum=crypto.createHash('sha256').update(bytes).digest('hex');
  const existing=this.lookup(sourceDigest);
  if(existing){
   if(existing.sha256!==checksum||existing.subject_type!==subjectType||existing.subject_id!==subjectId||
    existing.training_id!==trainingId)throw Error('Conflicting evidence for existing email source');
   return {evidenceId:existing.id,duplicate:true};
  }
  const id=uuid(),dek=crypto.randomBytes(32);
  try{
   const data=seal(bytes,dek,'icebreaker-email-evidence-v1:'+id+':'+subjectType+':'+subjectId);
   const wrapped=seal(dek,keyFromEnvironment(),'icebreaker-email-dek-v1:'+id);
   this.db.exec('BEGIN IMMEDIATE');
   try{
    this.db.prepare('INSERT INTO archived_evidence VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
     id,sourceDigest,subjectType,subjectId,trainingId,mime,bytes.length,checksum,data.data,data.nonce,data.tag,
     wrapped.data,wrapped.nonce,wrapped.tag,new Date().toISOString());
    this.audit('EVIDENCE_ENCRYPTED',id,actor,{subjectType,subjectId});
    this.db.exec('COMMIT');
   }catch(e){this.db.exec('ROLLBACK');throw e;}
   return {evidenceId:id,duplicate:false};
  }finally{dek.fill(0);}
 }
 // For authorized internal evidence-review services only; never a public URL.
 decryptForReview(id,actor){
  const r=this.db.prepare('SELECT * FROM archived_evidence WHERE id=?').get(id);
  if(!r)throw Error('Evidence not found');
  const dek=open(r.wrapped_key,keyFromEnvironment(),r.key_nonce,r.key_tag,'icebreaker-email-dek-v1:'+id);
  try{
   const bytes=open(r.encrypted_data,dek,r.data_nonce,r.data_tag,'icebreaker-email-evidence-v1:'+id+':'+r.subject_type+':'+r.subject_id);
   if(crypto.createHash('sha256').update(bytes).digest('hex')!==r.sha256)throw Error('Evidence integrity failed');
   this.audit('EVIDENCE_REVIEW_READ',id,actor);
   return {mime:r.mime,bytes};
  }finally{dek.fill(0);}
 }
 async scanQuarantined(id,actor,scanner=require('./malware-scanner').scanWithClamav){
  const row=this.db.prepare('SELECT scan_state FROM archived_evidence WHERE id=?').get(id);
  if(!row||row.scan_state!=='QUARANTINED')throw Error('Evidence is not quarantined');
  const document=this.decryptForReview(id,'scanner-worker');
  let result;
  try{result=await scanner(document.bytes);}
  finally{document.bytes.fill(0);}
  if(!result||result.engine!=='clamav'||typeof result.clean!=='boolean')throw Error('Untrusted scanner result');
  const next=result.clean?'CLEAN':'REJECTED';
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const changed=this.db.prepare("UPDATE archived_evidence SET scan_state=? WHERE id=? AND scan_state='QUARANTINED'").run(next,id);
   if(changed.changes!==1)throw Error('Scan state changed');
   this.audit('EVIDENCE_SCAN_'+next,id,actor);
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
  return {evidenceId:id,scanState:next};
 }
 scanStatus(id){
  const row=this.db.prepare('SELECT scan_state scanState FROM archived_evidence WHERE id=?').get(id);
  if(!row)throw Error('Evidence not found');
  return row.scanState;
 }
 // Compensating cleanup when the central intake transaction fails.
 discard(id,actor){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   this.db.prepare('DELETE FROM archived_evidence WHERE id=?').run(id);
   this.audit('EVIDENCE_DISCARDED',id,actor);
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 close(){this.db.close();}
}
module.exports={EvidenceArchive};
