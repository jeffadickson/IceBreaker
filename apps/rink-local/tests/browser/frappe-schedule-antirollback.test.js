'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {canonical}=require('../../server/frappe-schedule-verifier');
const {stageSignedSchedule,latestStaged,openStagingDatabase}=require('../../server/frappe-schedule-staging');
const now=Date.parse('2026-10-13T21:00:00Z');
function signer(){
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
 const trust={key1:{issuer:'league-dev',leagues:['demo-league'],
  public_key_base64:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')}};
 function bundle(releaseRevision,overrides={}){
  const unsigned={schema_version:2,fictional:true,league_id:'demo-league',
   issued_at:'2026-10-13T20:00:00Z',expires_at:'2026-10-14T20:00:00Z',
   issuer:'league-dev',key_id:'key1',release_revision:releaseRevision,
   games:[{game_id:'game-001',division_id:'demo-10u',home_team_id:'maple',
    away_team_id:'flyers',scheduled_utc:'2026-10-14T18:00:00Z',
    schedule_status:'Scheduled'}],...overrides};
  return {...unsigned,signature:crypto.sign(null,Buffer.from(canonical(unsigned),'ascii'),privateKey).toString('base64')};
 }
 return {trust,bundle};
}
test('M3 signed schedule staging persists highest revision across restart without modifying authority',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-frappe-stage-')),file=path.join(dir,'staging.db');
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const {trust,bundle}=signer();
 let db=openStagingDatabase(file);
 assert.equal(stageSignedSchedule(db,bundle(4),trust,'demo-league',{now}).status,'staged');
 assert.equal(stageSignedSchedule(db,bundle(4),trust,'demo-league',{now}).status,'duplicate');
 assert.equal(latestStaged(db,'demo-league').releaseRevision,4);
 assert.equal(latestStaged(db,'demo-league').games.length,1);
 db.close();
 db=openStagingDatabase(file);
 t.after(()=>db.close());
 assert.throws(()=>stageSignedSchedule(db,bundle(3),trust,'demo-league',{now}),/rollback/);
 assert.throws(()=>stageSignedSchedule(db,bundle(4,{games:[]}),trust,'demo-league',{now}),/Conflicting/);
 assert.equal(stageSignedSchedule(db,bundle(5),trust,'demo-league',{now}).releaseRevision,5);
 assert.equal(latestStaged(db,'demo-league').releaseRevision,5);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM frappe_schedule_staged').get().n,2);
 assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='games'").get(),undefined);
});
test('invalid, expired, wrong league, unversioned and private-data bundles cannot stage',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-frappe-negative-')),db=openStagingDatabase(path.join(dir,'staging.db'));
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 const {trust,bundle}=signer();
 for(const value of [bundle(0),bundle(-1),bundle(1.5),bundle(2147483648),
  bundle(1,{league_id:'other-league'}),bundle(1,{games:[{...bundle(1).games[0],birth_date:'2016-01-01'}]})])
  assert.throws(()=>stageSignedSchedule(db,value,trust,'demo-league',{now}));
 const v1=bundle(1);delete v1.release_revision;v1.schema_version=1;
 assert.throws(()=>stageSignedSchedule(db,v1,trust,'demo-league',{now}));
 assert.throws(()=>stageSignedSchedule(db,bundle(1),trust,'demo-league',{now:Date.parse('2026-10-14T20:00:00Z')}),/Expired/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM frappe_schedule_highwater').get().n,0);
});
test('signed payload tampering and wrong signing key cannot change highwater',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-frappe-tamper-')),db=openStagingDatabase(path.join(dir,'staging.db'));
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 const {trust,bundle}=signer(),signed=bundle(2);
 stageSignedSchedule(db,signed,trust,'demo-league',{now});
 const tampered=structuredClone(bundle(3));tampered.games[0].scheduled_utc='2026-10-14T19:00:00Z';
 assert.throws(()=>stageSignedSchedule(db,tampered,trust,'demo-league',{now}),/signature/);
 const other=signer();
 assert.throws(()=>stageSignedSchedule(db,other.bundle(3),trust,'demo-league',{now}),/signature/);
 assert.equal(latestStaged(db,'demo-league').releaseRevision,2);
});
