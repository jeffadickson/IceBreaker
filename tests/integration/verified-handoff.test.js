'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Authority}=require('../../apps/rink-local/server/authority-sqlite');
const {createCentralServer}=require('../../services/ingest/central-server');
const {RinkSyncClient}=require('../../services/ingest/rink-sync-client');
const {handoff,verifyPackage,restoreIdleStandby}=require('../../services/ingest/verified-handoff');
const ADMIN='fictional-handoff-admin-secret-123456';
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-handoff-')),gameId='handoff-game';
 const central=createCentralServer({dbPath:path.join(dir,'central.db'),adminKey:ADMIN});
 const addr=await central.start(),base='http://127.0.0.1:'+addr.port;
 const keys={a:crypto.generateKeyPairSync('ed25519'),b:crypto.generateKeyPairSync('ed25519')};
 const post=async(route,body)=>{
  const res=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json','x-admin-key':ADMIN},body:JSON.stringify(body)});
  return {status:res.status,data:await res.json()};
 };
 for(const id of ['a','b'])assert.equal((await post('/admin/stations',{stationId:'rink-'+id,publicKey:keys[id].publicKey.export({format:'pem',type:'spki'})})).status,201);
 assert.equal((await post('/admin/assignments',{stationId:'rink-a',gameId})).status,201);
 const files={a:path.join(dir,'a.sqlite'),b:path.join(dir,'b.sqlite')};
 const a=new Authority({dbPath:files.a,gameId}),b=new Authority({dbPath:files.b,gameId});
 assert.equal((await post('/admin/games/policy',{gameId,version:a.timingVersion,rules:a.timingRules})).status,200);
 t.after(async()=>{a.close();b.close();await central.close();fs.rmSync(dir,{recursive:true,force:true});});
 const command=(x,c)=>x.command(c,{key:'handoff-'+crypto.randomUUID()});
 const client=(id,epoch)=>new RinkSyncClient({dbPath:files[id],remoteUrl:base,gameId,stationId:'rink-'+id,privateKey:keys[id].privateKey,epoch});
 return {a,b,files,base,gameId,central,post,command,client,keys};
}
test('HANDOFF-001: backup restores goalie/penalty/clock journal, requires operator approval and then publishes',async t=>{
 const x=await fixture(t);
 x.command(x.a,{type:'GOALIE_CHANGED',team:'home',player:'29',reason:'Starting'});
 x.command(x.a,{type:'SHOT_RECORDED',team:'away'});
 x.command(x.a,{type:'PENALTY_ASSESSED',team:'away',player:'12',infraction:'Tripping',duration:120});
 x.command(x.a,{type:'CLOCK_UPDATED',action:'SET',seconds:420});
 await x.client('a',1).flush();
 let shown;
 const result=await handoff({remoteUrl:x.base,dbPath:x.files.b,gameId:x.gameId,stationId:'rink-b',adminKey:ADMIN,privateKey:x.keys.b.privateKey,
  confirm:async details=>{shown=details;return true;}});
 assert.equal(result.active,true);
 assert.equal(result.restored,4);
 assert.equal(result.epoch,2);
 assert.equal(result.seconds,420);
 assert.equal(shown.goalies.home,'29');
 assert.deepEqual(x.a.spectator().scores,x.b.spectator().scores); // standby object must be reopened to see restoration
 const {project}=require('../../apps/rink-local/server/authority-sqlite');
 const rows=x.b.db.prepare('SELECT * FROM game_events WHERE game_id=? ORDER BY seq').all(x.gameId);
 const recovered=project(rows,x.b.timingRules);
 assert.equal(recovered.revision,4);
 assert.equal(recovered.goalies.home,'29');
 assert.equal(recovered.seconds,420);
 assert.equal(recovered.events.filter(e=>e.type==='PENALTY_ASSESSED').length,1);
 assert.equal(x.b.db.prepare('SELECT COUNT(*) n FROM sync_outbox WHERE delivered=0').get().n,0);
 x.b.state=recovered;
 x.command(x.b,{type:'SHOT_RECORDED',team:'home'});
 const upload=await x.client('b',2).flush();
 assert.deepEqual(upload.accepted,[5]);
 assert.equal(x.central.snapshot(x.gameId).lastSequence,5);
 x.command(x.a,{type:'SHOT_RECORDED',team:'home'});
 await assert.rejects(()=>x.client('a',1).flush(),e=>e.status===409);
});
test('HANDOFF-002: declined confirmation leaves owner unchanged and standby empty',async t=>{
 const x=await fixture(t);
 x.command(x.a,{type:'SHOT_RECORDED',team:'home'});
 await x.client('a',1).flush();
 await assert.rejects(()=>handoff({remoteUrl:x.base,dbPath:x.files.b,gameId:x.gameId,stationId:'rink-b',adminKey:ADMIN,privateKey:x.keys.b.privateKey,
  confirm:async()=>false}),/did not confirm/);
 assert.equal(x.b.rows().length,0);
 assert.equal(x.central.db.prepare('SELECT station_id FROM game_owners WHERE game_id=?').get(x.gameId).station_id,'rink-a');
});
test('HANDOFF-003: tampered manifest, divergent standby, changed central journal fail closed',async t=>{
 const x=await fixture(t);
 x.command(x.a,{type:'SHOT_RECORDED',team:'home'});
 await x.client('a',1).flush();
 const prepared=(await x.post('/admin/games/prepare-handoff',{gameId:x.gameId,stationId:'rink-b'})).data;
 assert.equal(verifyPackage(prepared,{adminKey:ADMIN,gameId:x.gameId,stationId:'rink-b'}).rows.length,1);
 const forged=structuredClone(prepared);forged.manifest.events[0].data.teamId='away';
 assert.throws(()=>verifyPackage(forged,{adminKey:ADMIN,gameId:x.gameId,stationId:'rink-b'}),/signature or digest/);
 x.command(x.b,{type:'SHOT_RECORDED',team:'away'});
 assert.throws(()=>restoreIdleStandby({dbPath:x.files.b,pkg:prepared,adminKey:ADMIN,gameId:x.gameId,stationId:'rink-b'}),/contains a game journal/);
 const changed=(await x.post('/admin/games/commit-handoff',{gameId:x.gameId,stationId:'rink-b',expectedEpoch:1,digest:prepared.digest}));
 assert.equal(changed.status,401); // no station-signed restoration receipt
 assert.equal(x.central.db.prepare('SELECT station_id FROM game_owners WHERE game_id=?').get(x.gameId).station_id,'rink-a');
});

test('HANDOFF-004: new owner events after prepare invalidate an otherwise signed restore receipt',async t=>{
 const x=await fixture(t);
 x.command(x.a,{type:'SHOT_RECORDED',team:'home'});
 await x.client('a',1).flush();
 const pkg=(await x.post('/admin/games/prepare-handoff',{gameId:x.gameId,stationId:'rink-b'})).data;
 restoreIdleStandby({dbPath:x.files.b,pkg,adminKey:ADMIN,gameId:x.gameId,stationId:'rink-b'});
 x.command(x.a,{type:'SHOT_RECORDED',team:'away'});
 await x.client('a',1).flush();
 const receipt=JSON.stringify({gameId:x.gameId,stationId:'rink-b',digest:pkg.digest,expectedEpoch:1});
 const stationSignature=crypto.sign(null,Buffer.from(receipt),x.keys.b.privateKey).toString('base64');
 const result=await x.post('/admin/games/commit-handoff',{gameId:x.gameId,stationId:'rink-b',digest:pkg.digest,expectedEpoch:1,stationSignature});
 assert.equal(result.status,409);
 assert.equal(x.central.db.prepare('SELECT station_id FROM game_owners WHERE game_id=?').get(x.gameId).station_id,'rink-a');
 assert.equal(x.central.snapshot(x.gameId).lastSequence,2);
});
test('HANDOFF-005: pinned game refuses unsafe legacy transfer path',async t=>{
 const x=await fixture(t);
 const result=await x.post('/admin/games/transfer',{gameId:x.gameId,stationId:'rink-b'});
 assert.equal(result.status,409);
 assert.match(result.data.error,/verified/);
});

test('HANDOFF-006: running clock and mismatched timing policy cannot be restored',async t=>{
 const x=await fixture(t);
 x.command(x.a,{type:'CLOCK_UPDATED',action:'START',seconds:600});
 await x.client('a',1).flush();
 const pkg=(await x.post('/admin/games/prepare-handoff',{gameId:x.gameId,stationId:'rink-b'})).data;
 assert.throws(()=>verifyPackage(pkg,{adminKey:ADMIN,gameId:x.gameId,stationId:'rink-b'}),/running clock/);
 assert.equal(x.b.rows().length,0);
 x.command(x.a,{type:'CLOCK_UPDATED',action:'STOP',seconds:590});
 await x.client('a',1).flush();
 const fresh=(await x.post('/admin/games/prepare-handoff',{gameId:x.gameId,stationId:'rink-b'})).data;
 x.b.db.prepare('UPDATE game_timing_policy SET version=? WHERE game_id=?').run('WRONG-POLICY',x.gameId);
 assert.throws(()=>restoreIdleStandby({dbPath:x.files.b,pkg:fresh,adminKey:ADMIN,gameId:x.gameId,stationId:'rink-b'}),/timing policy differs/);
 assert.equal(x.b.rows().length,0);
});
