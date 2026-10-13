'use strict';
// DEVELOPMENT encrypted document vault. Production requires KMS, malware scanning,
// encrypted backups, consent and security review.
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const uuid=()=>crypto.randomUUID();
const types=new Set(['BIRTH_CERTIFICATE','AGE_VERIFICATION','TRAINING_CERTIFICATE','REGISTRATION']);
const mimes=new Set(['application/pdf','image/png','image/jpeg']),MAX_BYTES=1024*1024;
function keyFromEnvironment(){
 const raw=process.env.ICEBREAKER_DOCUMENT_KEK_BASE64;
 if(!raw||!/^[A-Za-z0-9+/]{43}=$/.test(raw))throw Error('Document encryption key not configured');
 const key=Buffer.from(raw,'base64');if(key.length!==32)throw Error('Document key must be 256 bits');return key;
}
function seal(plaintext,key,aad){
 const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
 cipher.setAAD(Buffer.from(aad));
 const data=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 return {nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data};
}
function open(data,key,nonce,tag,aad){
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(nonce,'base64'));
 decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(Buffer.from(tag,'base64'));
 return Buffer.concat([decipher.update(data),decipher.final()]);
}
function signatureOk(mime,data){
 if(mime==='application/pdf')return data.subarray(0,5).equals(Buffer.from('%PDF-'));
 if(mime==='image/png')return data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(mime==='image/jpeg')return data.length>=4&&data[0]===255&&data[1]===216&&data[data.length-2]===255&&data[data.length-1]===217;
 return false;
}
class EncryptedDocuments{
 constructor(db,root){
  this.db=db;this.root=path.resolve(root);fs.mkdirSync(this.root,{recursive:true,mode:0o700});
  db.exec("CREATE TABLE IF NOT EXISTS private_documents(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),document_type TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,digest_sha256 TEXT NOT NULL,wrapped_key BLOB NOT NULL,key_nonce TEXT NOT NULL,key_tag TEXT NOT NULL,data_nonce TEXT NOT NULL,data_tag TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('QUARANTINED','PENDING','VERIFIED','REJECTED','REVOKED')),uploaded_by TEXT NOT NULL,uploaded_at TEXT NOT NULL,verified_by TEXT,verified_at TEXT,decision_note TEXT)");
  db.exec("CREATE INDEX IF NOT EXISTS private_documents_player ON private_documents(player_id,status)");
 }
 audit(action,documentId,actor,details={}){
  this.db.prepare('INSERT INTO league_audit VALUES(?,?,?,?,?,?)').run(uuid(),new Date().toISOString(),actor,action,documentId,JSON.stringify(details));
 }
 objectPath(id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid document ID');return path.join(this.root,id+'.bin');}
 store({playerId,documentType,mime,data},actor){
  if(!types.has(documentType)||!mimes.has(mime)||!Buffer.isBuffer(data)||data.length<8||data.length>MAX_BYTES||!signatureOk(mime,data))throw Error('Invalid document type, size or signature');
  if(!this.db.prepare('SELECT 1 FROM players WHERE id=?').get(playerId))throw Error('Unknown player');
  const kek=keyFromEnvironment(),id=uuid(),dek=crypto.randomBytes(32);
  const aad='icebreaker-doc-v1:'+id+':'+playerId+':'+documentType;
  const enc=seal(data,dek,aad),wrapped=seal(dek,kek,'icebreaker-dek-v1:'+id);
  const object=this.objectPath(id);
  fs.writeFileSync(object,enc.data,{flag:'wx',mode:0o600});
  try{
   this.db.exec('BEGIN IMMEDIATE');
   this.db.prepare("INSERT INTO private_documents(id,player_id,document_type,mime,bytes,digest_sha256,wrapped_key,key_nonce,key_tag,data_nonce,data_tag,status,uploaded_by,uploaded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'QUARANTINED',?,?)").run(id,playerId,documentType,mime,data.length,crypto.createHash('sha256').update(data).digest('hex'),wrapped.data,wrapped.nonce,wrapped.tag,enc.nonce,enc.tag,actor,new Date().toISOString());
   this.audit('DOCUMENT_UPLOADED',id,actor,{playerId,documentType,status:'QUARANTINED'});
   this.db.exec('COMMIT');
  }catch(e){try{this.db.exec('ROLLBACK');}catch{}fs.rmSync(object,{force:true});throw e;}
  finally{dek.fill(0);}
  return {documentId:id,status:'QUARANTINED'};
 }
 row(id){const r=this.db.prepare('SELECT * FROM private_documents WHERE id=?').get(id);if(!r)throw Error('Document not found');return r;}
 list(playerId){return this.db.prepare("SELECT id documentId,document_type documentType,mime,bytes,status,uploaded_at uploadedAt,verified_at verifiedAt FROM private_documents WHERE player_id=? ORDER BY uploaded_at DESC").all(playerId);}
 // Only a separate scanner service should attest a passing malware scan.
 // Development quarantine has no scanner, so documents remain quarantined.
 releaseFromQuarantine(id,actor,scanPassed){
  if(scanPassed!==true)throw Error('Malware scan attestation required');
  const r=this.row(id);if(r.status!=='QUARANTINED')throw Error('Document is not quarantined');
  this.db.prepare("UPDATE private_documents SET status='PENDING' WHERE id=?").run(id);
  this.audit('DOCUMENT_SCAN_PASSED',id,actor);return {documentId:id,status:'PENDING'};
 }
 decide(id,actor,decision,note){
  if(!['VERIFIED','REJECTED','REVOKED'].includes(decision)||typeof note!=='string'||!note.trim()||note.length>300)throw Error('Invalid document decision');
  const r=this.row(id);
  if(decision==='REVOKED'?r.status!=='VERIFIED':r.status!=='PENDING')throw Error('Invalid document state transition');
  this.db.prepare('UPDATE private_documents SET status=?,verified_by=?,verified_at=?,decision_note=? WHERE id=?').run(decision,actor,new Date().toISOString(),note.trim(),id);
  this.audit('DOCUMENT_'+decision,id,actor,{playerId:r.player_id});return {documentId:id,status:decision};
 }
 read(id,actor){
  const r=this.row(id);if(r.status!=='PENDING'&&r.status!=='VERIFIED')throw Error('Document not available for viewing');
  const dek=open(r.wrapped_key,keyFromEnvironment(),r.key_nonce,r.key_tag,'icebreaker-dek-v1:'+id);
  try{
   const data=open(fs.readFileSync(this.objectPath(id)),dek,r.data_nonce,r.data_tag,'icebreaker-doc-v1:'+id+':'+r.player_id+':'+r.document_type);
   if(data.length!==r.bytes||crypto.createHash('sha256').update(data).digest('hex')!==r.digest_sha256)throw Error('Document integrity verification failed');
   this.audit('DOCUMENT_READ',id,actor,{playerId:r.player_id});return {mime:r.mime,data};
  }finally{dek.fill(0);}
 }
}
module.exports={EncryptedDocuments,seal,open,keyFromEnvironment,MAX_BYTES};
