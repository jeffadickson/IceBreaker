'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {canonical}=require('../../server/frappe-schedule-verifier');
const {stageSignedTraining,latestStagedTraining,openTrainingStagingDatabase,init}=require('../../server/frappe-training-staging');
const {run}=require('../../server/stage-frappe-training');
const now=Date.parse('2026-10-14T13:00:00Z');
function signer(){
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
 const trust={'training-dev':{issuer:'icebreaker-dev',leagues:['demo-league'],
  public_key_base64:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')}};
 function bundle(release_revision=1,policies=[{
  training_course:'course-safesport',role:'COACH',renewal_mode:'ANNUAL_SEASON',
  validity_days:null,required:true,effective_from:'2026-09-01',
  effective_to:null,revision:1,season:'demo-2026'
 }]){
  const unsigned={schema_version:1,fictional:true,league_id:'demo-league',issuer:'icebreaker-dev',
   key_id:'training-dev',issued_at:'2026-10-14T12:00:00Z',
   expires_at:'2026-10-15T12:00:00Z',release_revision,policies};
  return {...unsigned,signature:crypto.sign(null,Buffer.from(canonical(unsigned),'ascii'),privateKey).toString('base64')};
 }
 return {bundle,trust};
}
test('M4 training staging accepts signed policy, exact replay, rejects rollback and conflict',()=>{
 const db=new DatabaseSync(':memory:');init(db);
 try{
  const x=signer(),first=x.bundle(3),next=x.bundle(4);
  const one=stageSignedTraining(db,first,x.trust,'demo-league',{now});
  assert.equal(one.status,'staged');assert.equal(one.policyCount,1);
  assert.equal(stageSignedTraining(db,first,x.trust,'demo-league',{now}).status,'duplicate');
  assert.throws(()=>stageSignedTraining(db,x.bundle(2),x.trust,'demo-league',{now}),/rollback/);
  assert.throws(()=>stageSignedTraining(db,x.bundle(3,[]),x.trust,'demo-league',{now}),/Conflicting/);
  assert.equal(stageSignedTraining(db,next,x.trust,'demo-league',{now}).releaseRevision,4);
  const latest=latestStagedTraining(db,'demo-league');
  assert.equal(latest.releaseRevision,4);
  assert.equal(latest.policies[0].role,'COACH');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM frappe_training_staged').get().n,2);
  for(const name of ['games','game_events','event_journal','roster_memberships','training_completions_v2']){
   assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name=?").get(name).n,0);
  }
 }finally{db.close();}
});
test('M4 tampering, cross-league, expired, and private fields never persist',()=>{
 const db=new DatabaseSync(':memory:');init(db);
 try{
  const x=signer(),good=x.bundle(1),altered=structuredClone(good);
  altered.policies[0].required=false;
  assert.throws(()=>stageSignedTraining(db,altered,x.trust,'demo-league',{now}),/signature/);
  assert.throws(()=>stageSignedTraining(db,good,x.trust,'wrong-league',{now}),/Wrong league/);
  assert.throws(()=>stageSignedTraining(db,good,x.trust,'demo-league',{now:Date.parse('2026-10-16T00:00:00Z')}),/expired/);
  const leak=x.bundle(1,[{...good.policies[0],birth_date:'2016-01-01'}]);
  assert.throws(()=>stageSignedTraining(db,leak,x.trust,'demo-league',{now}),/Unexpected training policy fields/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM frappe_training_staged').get().n,0);
 }finally{db.close();}
});
test('M4 persistent cache survives restart and refuses authoritative game database',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-training-staging-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'training-cache.db'),x=signer();
 let db=openTrainingStagingDatabase(file);
 try{stageSignedTraining(db,x.bundle(5),x.trust,'demo-league',{now});}finally{db.close();}
 db=openTrainingStagingDatabase(file);
 try{
  assert.equal(latestStagedTraining(db,'demo-league').releaseRevision,5);
  assert.throws(()=>stageSignedTraining(db,x.bundle(4),x.trust,'demo-league',{now}),/rollback/);
 }finally{db.close();}
 const authority=path.join(dir,'game.db'),unsafe=new DatabaseSync(authority);
 unsafe.exec('CREATE TABLE games(id TEXT PRIMARY KEY)');
 unsafe.close();
 assert.throws(()=>openTrainingStagingDatabase(authority),/Refusing authoritative/);
 assert.throws(()=>openTrainingStagingDatabase(':memory:'),/persistent/);
 const link=path.join(dir,'link.db');fs.symlinkSync(authority,link);
 assert.throws(()=>openTrainingStagingDatabase(link),/Symlink/);
});
test('M4 offline CLI stages signed policy, deduplicates, and refuses production',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-training-cli-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const x=signer(),bundle=path.join(dir,'signed.json'),trust=path.join(dir,'trust.json'),db=path.join(dir,'cache.db');
 // The CLI uses real current time. Sign a short-lived bundle for this test.
 const issued=new Date(Date.now()-60_000).toISOString().slice(0,19)+'Z';
 const expires=new Date(Date.now()+3600_000).toISOString().slice(0,19)+'Z';
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
 const unsigned={...x.bundle(1),issued_at:issued,expires_at:expires,release_revision:7};
 delete unsigned.signature;
 const signed={...unsigned,signature:crypto.sign(null,Buffer.from(canonical(unsigned),'ascii'),privateKey).toString('base64')};
 const keys={'training-dev':{issuer:'icebreaker-dev',leagues:['demo-league'],public_key_base64:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')}};
 fs.writeFileSync(bundle,JSON.stringify(signed));fs.writeFileSync(trust,JSON.stringify(keys));
 const argv=['--staging-db',db,'--bundle',bundle,'--trust',trust,'--league','demo-league'];
 assert.equal(run(argv).status,'staged');
 assert.equal(run(argv).status,'duplicate');
 const prev=process.env.ICEBREAKER_PRODUCTION_MODE;
 process.env.ICEBREAKER_PRODUCTION_MODE='1';
 try{assert.throws(()=>run(argv),/not production-authorized/);}
 finally{if(prev===undefined)delete process.env.ICEBREAKER_PRODUCTION_MODE;else process.env.ICEBREAKER_PRODUCTION_MODE=prev;}
});
