'use strict';
// Identity must be explicitly selected and the exact legal name confirmed.
// Preview does not write any certificate, evidence, or eligibility records.
const crypto=require('node:crypto');
const {parseMockEmail}=require('./mock-registration-email');
const {sourceDigest,stage}=require('./training-intake');
const {decryptField}=require('./private-fields');
const {EvidenceArchive}=require('./email-evidence-archive');
function resolvePerson(db,subjectType,subjectId){
 if(subjectType==='PLAYER'){
  const row=db.prepare('SELECT legal_name name FROM player_private_profiles WHERE player_id=?').get(subjectId);
  if(!row)throw Error('Player private profile missing; do not auto-match by email name');
  return decryptField(row.name,subjectId,'legalName');
 }
 if(subjectType==='ADULT'){
  const row=db.prepare('SELECT full_name name FROM player_related_people WHERE id=?').get(subjectId);
  if(!row)throw Error('Unknown adult; do not auto-match by email name');
  return decryptField(row.name,subjectId,'fullName');
 }
 throw Error('Invalid participant type');
}
function preview(db,mail,{subjectType,subjectId}){
 const parsed=parseMockEmail(mail);
 const legalName=resolvePerson(db,subjectType,subjectId);
 const course=db.prepare('SELECT id,title FROM training_catalog WHERE code=? AND active=1').get(parsed.trainingCode);
 if(!course)throw Error('Unknown or inactive training course');
 // Exact identity check, allowing only capitalization and repeated whitespace.
 const normalize=s=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US');
 return {parsed,legalName,subjectType,subjectId,trainingId:course.id,trainingTitle:course.title,
  nameMatches:normalize(parsed.claimedName)===normalize(legalName)};
}
function commit(db,mail,{subjectType,subjectId,confirmedName,actor,archivePath}){
 const p=preview(db,mail,{subjectType,subjectId});
 if(!p.nameMatches)throw Error('Certificate name differs from selected person; manual reconciliation required');
 if(typeof confirmedName!=='string'||confirmedName!==p.legalName)
  throw Error('Exact legal-name confirmation required before commit');
 if(typeof actor!=='string'||!actor.trim()||typeof archivePath!=='string'||!archivePath)
  throw Error('Identified operator and separate evidence archive required');
 const digest=sourceDigest('EMAIL',p.parsed.sourceId);
 const archive=new EvidenceArchive(archivePath);
 let createdId=null;
 try{
  const result=archive.store({sourceDigest:digest,subjectType,subjectId,trainingId:p.trainingId,
   mime:p.parsed.mime,bytes:p.parsed.bytes},actor);
  if(!result.duplicate)createdId=result.evidenceId;
  try{
   const intake=stage(db,{sourceType:'EMAIL',sourceId:p.parsed.sourceId,trainingId:p.trainingId,
    subjectType,subjectId,completedOn:p.parsed.completedOn,expiresOn:p.parsed.expiresOn,
    evidenceRef:'archive:'+result.evidenceId},actor);
   return {intakeId:intake.intakeId,state:intake.state,duplicate:intake.duplicate,
    evidenceId:result.evidenceId,evidenceStatus:'QUARANTINED'};
  }catch(error){
   if(createdId)archive.discard(createdId,actor);
   throw error;
  }
 }finally{archive.close();}
}
module.exports={preview,commit};
