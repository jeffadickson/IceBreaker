'use strict';
// Development family identity + verified relationship grants.
// A contact link alone is NEVER authorization to see a child's private data.
const crypto=require('node:crypto');
const uid=()=>crypto.randomUUID(),digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const valid=(x,n=200)=>typeof x==='string'&&x.trim()&&x.length<=n;
function passwordHash(p){
 if(!valid(p,256)||p.length<12)throw Error('Password too short');
 const salt=crypto.randomBytes(16);
 return salt.toString('hex')+':'+crypto.scryptSync(p,salt,64).toString('hex');
}
function passwordCheck(p,h){
 try{const [salt,expected]=h.split(':');return crypto.timingSafeEqual(crypto.scryptSync(p,Buffer.from(salt,'hex'),64),Buffer.from(expected,'hex'));}catch{return false;}
}
class FamilyAccess{
 constructor(db){
  this.db=db;
  db.exec("CREATE TABLE IF NOT EXISTS family_accounts(id TEXT PRIMARY KEY,person_id TEXT NOT NULL UNIQUE REFERENCES player_related_people(id),email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS family_sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES family_accounts(id),expires_ms INTEGER NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS family_grants(person_id TEXT NOT NULL REFERENCES player_related_people(id),player_id TEXT NOT NULL REFERENCES players(id),can_view_documents INTEGER NOT NULL DEFAULT 0,can_upload_documents INTEGER NOT NULL DEFAULT 0,verified_at TEXT NOT NULL,verified_by TEXT NOT NULL,revoked_at TEXT,PRIMARY KEY(person_id,player_id))");
 }
 audit(action,entity,actor,details={}){
  this.db.prepare('INSERT INTO league_audit VALUES(?,?,?,?,?,?)').run(uid(),new Date().toISOString(),actor,action,entity,JSON.stringify(details));
 }
 // Only a league admin after separate identity verification can provision an
 // account; this is a development operator attestation, not identity proof.
 provision(personId,email,password,actor){
  const p=this.db.prepare('SELECT * FROM player_related_people WHERE id=?').get(personId);
  if(!p||!valid(email,254)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!valid(actor,100))throw Error('Invalid family account');
  const accountId=uid();
  this.db.prepare('INSERT INTO family_accounts VALUES(?,?,?,?,?)').run(accountId,personId,email.toLowerCase(),passwordHash(password),new Date().toISOString());
  this.audit('FAMILY_ACCOUNT_PROVISIONED',personId,actor,{accountId});
  return {accountId,personId};
 }
 verifyRelationship(personId,playerId,{canViewDocuments=false,canUploadDocuments=false},actor){
  if(!valid(actor,100)||typeof canViewDocuments!=='boolean'||typeof canUploadDocuments!=='boolean')throw Error('Invalid guardian permissions');
  const link=this.db.prepare("SELECT relationship FROM player_person_links WHERE person_id=? AND player_id=?").get(personId,playerId);
  if(!link||!['PARENT','GUARDIAN'].includes(link.relationship))throw Error('Verified parent or guardian relationship required');
  this.db.prepare("INSERT INTO family_grants VALUES(?,?,?,?,?,?,NULL) ON CONFLICT(person_id,player_id) DO UPDATE SET can_view_documents=excluded.can_view_documents,can_upload_documents=excluded.can_upload_documents,verified_at=excluded.verified_at,verified_by=excluded.verified_by,revoked_at=NULL").run(personId,playerId,canViewDocuments?1:0,canUploadDocuments?1:0,new Date().toISOString(),actor);
  this.audit('GUARDIAN_GRANT_VERIFIED',playerId,actor,{personId,canViewDocuments,canUploadDocuments});
  return {personId,playerId,verified:true};
 }
 revoke(personId,playerId,actor){
  const changed=this.db.prepare('UPDATE family_grants SET revoked_at=? WHERE person_id=? AND player_id=? AND revoked_at IS NULL').run(new Date().toISOString(),personId,playerId);
  if(changed.changes!==1)throw Error('No active guardian grant');
  this.audit('GUARDIAN_GRANT_REVOKED',playerId,actor,{personId});
  return {revoked:true};
 }
 login(email,password){
  const row=this.db.prepare('SELECT * FROM family_accounts WHERE email=?').get(String(email||'').toLowerCase());
  if(!row||!passwordCheck(password,row.password_hash))throw Error('Invalid family credentials');
  const token=crypto.randomBytes(32).toString('base64url');
  this.db.prepare('INSERT INTO family_sessions VALUES(?,?,?)').run(digest(token),row.id,Date.now()+8*3600_000);
  return {token,expiresInSeconds:28800};
 }
 authenticate(token){
  if(typeof token!=='string'||token.length<30)throw Error('Family sign-in required');
  const row=this.db.prepare('SELECT a.id accountId,a.person_id personId FROM family_sessions s JOIN family_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_ms>?').get(digest(token),Date.now());
  if(!row)throw Error('Family sign-in required');return row;
 }
 logout(token){if(typeof token==='string')this.db.prepare('DELETE FROM family_sessions WHERE token_hash=?').run(digest(token));return {signedOut:true};}
 can(user,playerId,action){
  const row=this.db.prepare('SELECT can_view_documents canView,can_upload_documents canUpload FROM family_grants WHERE person_id=? AND player_id=? AND revoked_at IS NULL').get(user.personId,playerId);
  return !!row&&(action==='view'?!!row.canView:action==='upload'?!!row.canUpload:false);
 }
 children(user){
  return this.db.prepare("SELECT p.id playerId,p.display_name displayName,g.can_view_documents canViewDocuments,g.can_upload_documents canUploadDocuments FROM family_grants g JOIN players p ON p.id=g.player_id WHERE g.person_id=? AND g.revoked_at IS NULL ORDER BY p.display_name").all(user.personId);
 }
 ownContact(user){
  const p=this.db.prepare('SELECT id personId,full_name fullName,email,phone FROM player_related_people WHERE id=?').get(user.personId);
  if(!p)throw Error('Contact not found');
  this.audit('FAMILY_CONTACT_READ',user.personId,user.accountId);return p;
 }
 updateContact(user,{phone,email}){
  if(phone!==undefined&&phone!==null&&!valid(phone,50)||email!==undefined&&email!==null&&(!valid(email,254)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))throw Error('Invalid contact details');
  const old=this.ownContact(user);
  this.db.prepare('UPDATE player_related_people SET phone=?,email=? WHERE id=?').run(phone===undefined?old.phone:phone,email===undefined?old.email:email,user.personId);
  this.audit('FAMILY_CONTACT_UPDATED',user.personId,user.accountId);return {updated:true};
 }
}
module.exports={FamilyAccess};
