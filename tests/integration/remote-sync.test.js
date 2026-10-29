'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const {createCentralServer,signBatch}=require('../../services/ingest/central-server');
const adminKey='integration-test-admin-key-strong';
async function fixture(t){const cleanup=[];const dir=fs.mkdtempSync(path.join(os.tmpdir(),'icebreaker-central-'));const dbPath=path.join(dir,'central.db');let server=createCentralServer({dbPath,adminKey});let addr=await server.start();const base=`http://127.0.0.1:${addr.port}`;const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 const send=async(url,payload,extra={})=>{const r=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json',...extra},body:JSON.stringify(payload)});return {status:r.status,body:await r.json()};};
 const stationId='rink-a',gameId='game-1042';const admin={'x-admin-key':adminKey};assert.equal((await send('/admin/stations',{stationId,publicKey:publicKey.export({format:'pem',type:'spki'})},admin)).status,201);assert.equal((await send('/admin/assignments',{stationId,gameId},admin)).status,201);
 const push=(events,signature)=>{const batch={gameId,stationId,events};return send('/api/ingest/v1/batches',batch,{'x-station-signature':signature||signBatch(privateKey,batch)});};
 // Close dependent database owners before deleting the fixture on Windows.
 t.after(async()=>{for(const close of cleanup.reverse())await close();await server.close();fs.rmSync(dir,{recursive:true,force:true});});return {send,push,base,gameId,dbPath,privateKey,cleanup};}
const ev=(seq,type,data={})=>({seq,id:`event-${seq}`,type,data});
test('authenticated live ingestion, public scoreboard and shot counts',async t=>{const f=await fixture(t);const r=await f.push([ev(1,'PERIOD_STARTED',{period:1}),ev(2,'SHOT_RECORDED',{team:'home'}),ev(3,'GOAL_RECORDED',{team:'home',scorer:'TBD'}),ev(4,'GAME_ENDED',{})]);assert.equal(r.status,200);assert.deepEqual(r.body.accepted,[1,2,3,4]);const s=await (await fetch(f.base+'/api/public/v1/games/'+f.gameId)).json();assert.equal(s.score.home,1);assert.equal(s.shots.home,2);assert.equal(s.status,'provisional_final');assert.equal(s.events.length,4);});
test('offline retry is idempotent and sequence gaps rejected atomically',async t=>{const f=await fixture(t);const e=[ev(1,'GOAL_RECORDED',{team:'away'})];assert.deepEqual((await f.push(e)).body.accepted,[1]);assert.deepEqual((await f.push(e)).body.duplicates,[1]);const gap=await f.push([ev(2,'SHOT_RECORDED',{team:'away'}),ev(4,'GAME_ENDED',{})]);assert.equal(gap.status,409);assert.equal(gap.body.expectedSequence,3);const s=await(await fetch(f.base+'/api/public/v1/games/'+f.gameId)).json();assert.equal(s.events.length,1);assert.deepEqual((await f.push([ev(2,'SHOT_RECORDED',{team:'away'}),ev(3,'PERIOD_STARTED',{period:2})])).body.accepted,[2,3]);});
test('rejects unsigned and tampered batches',async t=>{const f=await fixture(t);const one=ev(1,'SHOT_RECORDED',{team:'home'});assert.equal((await f.push([one],'not-valid')).status,401);const batch={gameId:f.gameId,stationId:'rink-a',events:[one]};const sig=signBatch(f.privateKey,batch);batch.events[0].data.team='away';assert.equal((await f.send('/api/ingest/v1/batches',batch,{'x-station-signature':sig})).status,401);});
test('rejects unassigned stations, conflicting replay, and event-id collisions',async t=>{const f=await fixture(t);assert.equal((await f.send('/api/ingest/v1/batches',{gameId:'other-game',stationId:'rink-a',events:[ev(1,'SHOT_RECORDED',{team:'home'})]},{'x-station-signature':'dummy'})).status,403);assert.equal((await f.push([ev(1,'SHOT_RECORDED',{team:'home'})])).status,200);assert.equal((await f.push([ev(1,'SHOT_RECORDED',{team:'away'})])).status,409);const duplicateId={...ev(2,'SHOT_RECORDED',{team:'home'}),id:'event-1'};assert.equal((await f.push([duplicateId])).status,409);});
test('restart recovers accepted events and continues at correct sequence',async t=>{const f=await fixture(t);assert.equal((await f.push([ev(1,'GOAL_RECORDED',{team:'home'})])).status,200);const db=f.dbPath;const alt=createCentralServer({dbPath:db,adminKey});const addr=await alt.start();f.cleanup.push(()=>alt.close());const snap=await(await fetch(`http://127.0.0.1:${addr.port}/api/public/v1/games/${f.gameId}`)).json();assert.equal(snap.lastSequence,1);assert.equal(snap.score.home,1);});
test('admin registration requires secret and public spectator API rejects writes',async t=>{const f=await fixture(t);const r=await f.send('/admin/assignments',{stationId:'rink-a',gameId:'other'});assert.equal(r.status,403);assert.equal((await f.send('/api/public/v1/games/game-1042',{})).status,404);});

test('real rink SQLite outbox uploads and survives duplicate acknowledgement',async t=>{
 const f=await fixture(t);const {Authority}=require('../../apps/rink-local/server/authority-sqlite');const {RinkSyncClient}=require('../../services/ingest/rink-sync-client');
 const localDb=path.join(path.dirname(f.dbPath),'rink.db');const rink=new Authority({dbPath:localDb,gameId:f.gameId});f.cleanup.push(()=>rink.close());
 rink.command({type:'SHOT_RECORDED',team:'home'},{key:'local-first-0001'});
 rink.command({type:'GOAL_RECORDED',team:'away',scorer:'TBD',assist1:'TBD',assist2:'None'},{key:'local-first-0002'});
 const c=new RinkSyncClient({dbPath:localDb,remoteUrl:f.base,gameId:f.gameId,stationId:'rink-a',privateKey:f.privateKey});
 const first=await c.flush();assert.deepEqual(first.accepted,[1,2]);assert.equal((await c.flush()).empty,true);
 const db=rink.db;db.exec('UPDATE sync_outbox SET delivered=0');const again=await c.flush();assert.deepEqual(again.duplicates,[1,2]);
 const snapshot=await(await fetch(f.base+'/api/public/v1/games/'+f.gameId)).json();assert.deepEqual(snapshot.score,{home:0,away:1});assert.equal(snapshot.events.length,2);
});

test('exclusive game ownership requires explicit administrative transfer',async t=>{
 const f=await fixture(t);
 const keys=crypto.generateKeyPairSync('ed25519');
 const admin={'x-admin-key':adminKey};
 assert.equal((await f.send('/admin/stations',{stationId:'rink-b',publicKey:keys.publicKey.export({format:'pem',type:'spki'})},admin)).status,201);
 assert.equal((await f.send('/admin/assignments',{gameId:f.gameId,stationId:'rink-b'},admin)).status,409);
 assert.equal((await f.push([ev(1,'SHOT_RECORDED',{team:'home'})])).status,200);
 assert.equal((await f.send('/admin/games/transfer',{gameId:f.gameId,stationId:'rink-b'},admin)).status,200);
 assert.equal((await f.push([ev(2,'SHOT_RECORDED',{team:'home'})])).status,409);
 const batch={gameId:f.gameId,stationId:'rink-b',epoch:2,events:[ev(2,'SHOT_RECORDED',{team:'away'})]};
 assert.equal((await f.send('/api/ingest/v1/batches',batch,{'x-station-signature':signBatch(keys.privateKey,batch)})).status,200);
 const snap=await (await fetch(f.base+'/api/public/v1/games/'+f.gameId)).json();
 assert.deepEqual(snap.shots,{home:1,away:1});
});

test('station revocation blocks subsequent signed uploads',async t=>{
 const f=await fixture(t);const admin={'x-admin-key':adminKey};
 assert.equal((await f.push([ev(1,'SHOT_RECORDED',{team:'home'})])).status,200);
 assert.equal((await f.send('/admin/stations/revoke',{stationId:'rink-a'},admin)).body.revoked,true);
 assert.equal((await f.push([ev(2,'SHOT_RECORDED',{team:'home'})])).status,403);
 assert.equal((await f.send('/admin/assignments',{stationId:'rink-a',gameId:'another'},admin)).status,409);
});