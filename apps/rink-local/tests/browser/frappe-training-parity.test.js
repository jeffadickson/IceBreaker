'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
const {canonical}=require('../../server/frappe-schedule-verifier');
const {init,stageSignedTraining}=require('../../server/frappe-training-staging');
const {compareStagedTraining}=require('../../server/frappe-training-parity');
const now=Date.parse('2026-10-14T13:00:00Z');
function setup(){
 const stage=new DatabaseSync(':memory:'),local=new DatabaseSync(':memory:');
 init(stage);
 local.exec("CREATE TABLE league_seasons(league_id TEXT,season_id TEXT);CREATE TABLE training_catalog(id TEXT PRIMARY KEY,code TEXT);CREATE TABLE training_policy_versions(training_id TEXT,scope_type TEXT,scope_id TEXT,season_id TEXT,role TEXT,renewal_mode TEXT,validity_days INTEGER,required INTEGER,effective_from TEXT,effective_to TEXT,revision INTEGER)");
 local.prepare('INSERT INTO league_seasons VALUES(?,?)').run('demo-league','demo-2026');
 local.prepare('INSERT INTO training_catalog VALUES(?,?)').run('local-safesport','SAFESPORT');
 const insert=local.prepare('INSERT INTO training_policy_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)');
 insert.run('local-safesport','LEAGUE','demo-league','demo-2026','COACH','ANNUAL_SEASON',null,1,'2026-09-01',null,1);
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
 const unsigned={schema_version:1,fictional:true,league_id:'demo-league',issuer:'icebreaker-dev',
  key_id:'training-dev',issued_at:'2026-10-14T12:00:00Z',expires_at:'2026-10-15T12:00:00Z',
  release_revision:1,policies:[{training_course:'central-safesport',role:'COACH',
   renewal_mode:'ANNUAL_SEASON',validity_days:null,required:true,
   effective_from:'2026-09-01',effective_to:null,revision:1,season:'demo-2026'}]};
 const trust={'training-dev':{issuer:'icebreaker-dev',leagues:['demo-league'],
  public_key_base64:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')}};
 const bundle={...unsigned,signature:crypto.sign(null,Buffer.from(canonical(unsigned),'ascii'),privateKey).toString('base64')};
 stageSignedTraining(stage,bundle,trust,'demo-league',{now});
 return {stage,local};
}
test('M4 parity reports exact course/renewal/season match without mutating either database',()=>{
 const {stage,local}=setup();
 try{
  const before=local.prepare('SELECT COUNT(*) n FROM training_policy_versions').get().n;
  const report=compareStagedTraining(stage,local,'demo-league','demo-2026','2026-10-14',{'central-safesport':'local-safesport'});
  assert.equal(report.status,'match');assert.equal(report.issues.length,0);
  assert.equal(report.stagedReleaseRevision,1);
  assert.equal(local.prepare('SELECT COUNT(*) n FROM training_policy_versions').get().n,before);
  assert.equal(stage.prepare('SELECT COUNT(*) n FROM frappe_training_staged').get().n,1);
 }finally{stage.close();local.close();}
});
test('M4 parity detects renewal differences, missing mapping and unrecognized local policies',()=>{
 const {stage,local}=setup();
 try{
  const mapping={'central-safesport':'local-safesport'};
  local.prepare('UPDATE training_policy_versions SET required=0').run();
  assert.equal(compareStagedTraining(stage,local,'demo-league','demo-2026','2026-10-14',mapping).issues[0].type,'policy-mismatch');
  assert.equal(compareStagedTraining(stage,local,'demo-league','demo-2026','2026-10-14',{}).issues[0].type,'unmapped-central-course');
  assert.throws(()=>compareStagedTraining(stage,local,'demo-league','demo-2026','2026-10-14',{'one':'local-safesport','two':'local-safesport'}),/one-to-one/);
  assert.throws(()=>compareStagedTraining(stage,local,'wrong-league','demo-2026','2026-10-14',mapping),/No staged/);
  assert.throws(()=>compareStagedTraining(stage,local,'demo-league','demo-2026','2026-10-20',mapping),/expired/);
 }finally{stage.close();local.close();}
});
