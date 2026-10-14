'use strict';
// M4 Frappe training-policy bundle verifier. Read-only: it never mutates
// training completion, rink eligibility, game clock or event journal.
const crypto=require('node:crypto');
const {canonical}=require('./frappe-schedule-verifier');
const FIELDS=['schema_version','fictional','league_id','issuer','key_id',
 'issued_at','expires_at','release_revision','policies'];
const POLICY=['training_course','role','renewal_mode','validity_days',
 'required','effective_from','effective_to','revision','season'];
const ROLES=new Set(['PLAYER','PARENT','GUARDIAN','COACH','MANAGER','VOLUNTEER','OFFICIAL']);
const MODES=new Set(['ONCE','ANNUAL_CALENDAR','ANNUAL_SEASON','ROLLING_DAYS']);
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$/;
const DAY=/^\d{4}-\d\d-\d\d$/;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const SPKI=Buffer.from('302a300506032b6570032100','hex');
const exact=(obj,fields)=>obj!==null&&typeof obj==='object'&&!Array.isArray(obj)
 &&Object.keys(obj).length===fields.length&&fields.every(f=>Object.hasOwn(obj,f));
function day(x){
 if(typeof x!=='string'||!DAY.test(x)||!Number.isFinite(Date.parse(x+'T00:00:00Z'))
  ||new Date(Date.parse(x+'T00:00:00Z')).toISOString().slice(0,10)!==x)
  throw Error('Invalid policy date');
 return x;
}
function utc(x){
 if(typeof x!=='string'||!UTC.test(x)||!Number.isFinite(Date.parse(x))
  ||new Date(Date.parse(x)).toISOString().slice(0,19)+'Z'!==x)
  throw Error('Invalid UTC timestamp');
 return Date.parse(x);
}
function strictBase64(x,size){
 if(typeof x!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(x))
  throw Error('Invalid key encoding');
 const b=Buffer.from(x,'base64');
 if(b.length!==size||b.toString('base64')!==x)throw Error('Invalid key length');
 return b;
}
function verifyFrappeTrainingBundle(bundle,trust,league,{now=Date.now(),minimumRevision=0}={}){
 if(!exact(bundle,[...FIELDS,'signature']))throw Error('Unexpected signed training fields');
 const data=Object.fromEntries(FIELDS.map(k=>[k,bundle[k]]));
 if(data.schema_version!==1||data.fictional!==true)throw Error('Unsupported training bundle');
 for(const k of ['league_id','issuer','key_id'])
  if(typeof data[k]!=='string'||!ID.test(data[k]))throw Error('Invalid bundle identifier');
 if(data.league_id!==league)throw Error('Wrong league');
 if(!Number.isInteger(data.release_revision)||data.release_revision<1||data.release_revision>2147483647
  ||data.release_revision<=minimumRevision)throw Error('Stale training release');
 const issued=utc(data.issued_at),expires=utc(data.expires_at);
 if(expires<=issued||expires-issued>7*86400000||now<issued-300000||now>=expires)
  throw Error('Training bundle expired or future');
 if(!Array.isArray(data.policies)||data.policies.length>500)throw Error('Invalid policy list');
 let previous='';
 for(const p of data.policies){
  if(!exact(p,POLICY))throw Error('Unexpected training policy fields');
  if(typeof p.training_course!=='string'||!ID.test(p.training_course)
   ||!ROLES.has(p.role)||!MODES.has(p.renewal_mode))throw Error('Invalid policy identity');
  const key=p.role+'\0'+p.training_course;
  if(key<=previous)throw Error('Duplicate or unsorted training policy');
  previous=key;
  if(typeof p.required!=='boolean'||!Number.isInteger(p.revision)||p.revision<1)
   throw Error('Invalid policy flag or revision');
  if(p.renewal_mode==='ROLLING_DAYS'){
   if(!Number.isInteger(p.validity_days)||p.validity_days<1||p.validity_days>3650)
    throw Error('Invalid rolling validity');
  }else if(p.validity_days!==null)throw Error('Unexpected rolling validity');
  day(p.effective_from);
  if(p.effective_to!==null&&day(p.effective_to)<p.effective_from)
   throw Error('Invalid policy date range');
  if(p.season!==null&&(typeof p.season!=='string'||!ID.test(p.season)))
   throw Error('Invalid season');
  if(p.renewal_mode==='ANNUAL_SEASON'&&p.season===null)
   throw Error('Season renewal requires season');
 }
 const key=trust?.[data.key_id];
 if(!key||key.issuer!==data.issuer||!Array.isArray(key.leagues)||!key.leagues.includes(league))
  throw Error('Untrusted training issuer');
 const pub=strictBase64(key.public_key_base64,32);
 const sig=strictBase64(bundle.signature,64);
 const bytes=Buffer.from(canonical(data),'ascii');
 if(!crypto.verify(null,bytes,
  crypto.createPublicKey({key:Buffer.concat([SPKI,pub]),format:'der',type:'spki'}),sig))
  throw Error('Training signature invalid');
 return {leagueId:league,releaseRevision:data.release_revision,
  bundleSha256:crypto.createHash('sha256').update(bytes).digest('hex'),
  policyCount:data.policies.length,expiresAt:data.expires_at};
}
module.exports={verifyFrappeTrainingBundle};
