'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {canonical}=require('../../server/frappe-schedule-verifier');
const {verifyFrappeTrainingBundle}=require('../../server/frappe-training-verifier');
const now=Date.parse('2026-10-14T13:00:00Z');
function fixture(){
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
 const unsigned={
  schema_version:1,fictional:true,league_id:'demo-league',
  issuer:'icebreaker-league-dev',key_id:'dev-training-key',
  issued_at:'2026-10-14T12:00:00Z',expires_at:'2026-10-15T12:00:00Z',
  release_revision:4,policies:[{
   training_course:'course-safesport',role:'COACH',
   renewal_mode:'ANNUAL_SEASON',validity_days:null,required:true,
   effective_from:'2026-09-01',effective_to:null,revision:1,season:'demo-2026'
  }]
 };
 const signature=crypto.sign(null,Buffer.from(canonical(unsigned),'ascii'),privateKey).toString('base64');
 const trust={'dev-training-key':{issuer:'icebreaker-league-dev',leagues:['demo-league'],
  public_key_base64:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')}};
 return {bundle:{...unsigned,signature},trust};
}
const verify=(x,opts={})=>verifyFrappeTrainingBundle(x.bundle,x.trust,'demo-league',{now,...opts});
test('signed Frappe training policy verifies without changing rink state',()=>{
 const x=fixture(),r=verify(x);
 assert.equal(r.policyCount,1);
 assert.equal(r.releaseRevision,4);
 assert.match(r.bundleSha256,/^[a-f0-9]{64}$/);
 assert.equal(Object.hasOwn(r,'policies'),false);
});
test('training policy tampering, PII injection, incorrect issuer and league fail closed',()=>{
 const x=fixture();
 for(const mutate of [
  b=>{b.policies[0].required=false;},
  b=>{b.policies[0].birth_date='2016-01-01';},
  b=>{b.policies[0].validity_days=365;},
  b=>{b.policies[0].role='ADMIN';},
  b=>{b.policies[0].effective_from='2026-99-01';},
  b=>{b.release_revision=5;},
  b=>{b.league_id='other-league';},
  b=>{b.policies.push({...b.policies[0]});},
 ]){
  const clone={bundle:structuredClone(x.bundle),trust:x.trust};
  mutate(clone.bundle);
  assert.throws(()=>verify(clone));
 }
 assert.throws(()=>verifyFrappeTrainingBundle(x.bundle,x.trust,'other-league',{now}));
 const wrong=fixture();
 assert.throws(()=>verify({bundle:x.bundle,trust:wrong.trust}));
});
test('expiry, future timestamp and monotonic antirollback enforced',()=>{
 const x=fixture();
 assert.throws(()=>verify(x,{now:Date.parse('2026-10-15T12:00:00Z')}));
 assert.throws(()=>verify(x,{now:Date.parse('2026-10-14T11:00:00Z')}));
 assert.throws(()=>verify(x,{minimumRevision:4}));
 assert.throws(()=>verify(x,{minimumRevision:5}));
 assert.equal(verify(x,{minimumRevision:3}).releaseRevision,4);
});
test('canonical JSON is byte-compatible with Python sorted ASCII contract',()=>{
 const x=fixture();
 assert.equal(canonical({z:2,a:1}),'{"a":1,"z":2}');
 assert.equal(canonical(x.bundle.policies[0]).includes('birth_date'),false);
});
