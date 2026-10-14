'use strict';
// Read-only M4.3 reconciliation. Never activates policies or training evidence.
// Course mapping must be explicitly reviewed, not inferred by name or number.
const {latestStagedTraining}=require('./frappe-training-staging');
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$/;
const DAY=/^\d{4}-\d\d-\d\d$/;
function date(value){
 if(typeof value!=='string'||!DAY.test(value)||
  !Number.isFinite(Date.parse(value+'T00:00:00Z'))||
  new Date(Date.parse(value+'T00:00:00Z')).toISOString().slice(0,10)!==value)
  throw Error('Invalid reconciliation date');
 return value;
}
function key(role,course){return role+'\0'+course;}
function normalize(row){
 return {role:row.role,renewalMode:row.renewal_mode,
  validityDays:row.validity_days??null,required:!!row.required,
  effectiveFrom:row.effective_from,effectiveTo:row.effective_to??null,
  revision:row.revision,season:row.season??null};
}
function compareStagedTraining(stagingDb,localDb,leagueId,seasonId,asOf,courseMap){
 if(typeof leagueId!=='string'||!ID.test(leagueId)||typeof seasonId!=='string'||!ID.test(seasonId))
  throw Error('Invalid league or season');
 date(asOf);
 if(!courseMap||typeof courseMap!=='object'||Array.isArray(courseMap))
  throw Error('Explicit course ID mapping required');
 const staged=latestStagedTraining(stagingDb,leagueId);
 if(!staged)throw Error('No staged training release');
 if(asOf>staged.expiresAt.slice(0,10))throw Error('Staged training release expired');
 if(!localDb.prepare('SELECT 1 FROM league_seasons WHERE league_id=? AND season_id=?').get(leagueId,seasonId))
  throw Error('Local season outside league');
 const localRows=localDb.prepare("SELECT p.*,c.code FROM training_policy_versions p JOIN training_catalog c ON c.id=p.training_id WHERE p.scope_type='LEAGUE' AND p.scope_id=? AND (p.season_id='' OR p.season_id=?) AND p.effective_from<=? AND (p.effective_to IS NULL OR p.effective_to>=?) ORDER BY p.effective_from DESC,p.revision DESC").all(leagueId,seasonId,asOf,asOf);
 const selected=new Map();
 for(const row of localRows){
  const id=key(row.role,row.training_id),current=selected.get(id);
  if(!current||(row.season_id===seasonId&&current.season_id!==seasonId))
   selected.set(id,row);
 }
 const expected=new Map([...selected].map(([id,row])=>[id,normalize({...row,season:row.season_id||null})]));
 const actual=new Map(),issues=[],reverse=new Map();
 for(const [central,local] of Object.entries(courseMap)){
  if(!ID.test(central)||typeof local!=='string'||!ID.test(local))
   throw Error('Invalid course ID mapping');
  if(reverse.has(local))throw Error('Course mapping is not one-to-one');
  reverse.set(local,central);
 }
 for(const row of staged.policies){
  if(row.season!==null&&row.season!==seasonId)continue;
  if(row.effective_from>asOf||row.effective_to!==null&&row.effective_to<asOf)continue;
  const mapped=courseMap[row.training_course];
  if(!mapped){issues.push({type:'unmapped-central-course',course:row.training_course,role:row.role});continue;}
  const id=key(row.role,mapped);
  if(actual.has(id))throw Error('Ambiguous central policy mapping');
  actual.set(id,normalize(row));
 }
 for(const [id,central] of actual){
  const local=expected.get(id);
  if(!local){issues.push({type:'missing-local-policy',key:id});continue;}
  if(JSON.stringify(central)!==JSON.stringify(local))
   issues.push({type:'policy-mismatch',key:id,central,local});
 }
 for(const id of expected.keys())if(!actual.has(id))
  issues.push({type:'missing-central-policy',key:id});
 return {status:issues.length?'mismatch':'match',leagueId,seasonId,asOf,
  stagedReleaseRevision:staged.releaseRevision,centralPolicyCount:actual.size,
  localPolicyCount:expected.size,issues};
}
module.exports={compareStagedTraining};
