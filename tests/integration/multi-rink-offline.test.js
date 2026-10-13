'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createCentralServer,signBatch}=require('../../services/ingest/central-server');
const {RinkSyncClient}=require('../../services/ingest/rink-sync-client');
const {Authority}=require('../../apps/rink-local/server/authority-sqlite');
const ADMIN='fictional-distributed-test-admin-secret';
async function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-distributed-'));
 const central=createCentralServer({dbPath:path.join(dir,'central.db'),adminKey:ADMIN});
 const addr=await central.start(),base='http://127.0.0.1:'+addr.port,gameId='sim-multi-rink';
 const keys={a:crypto.generateKeyPairSync('ed25519'),b:crypto.generateKeyPairSync('ed25519')};
 const post=async(route,payload,headers={})=>{
  const response=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(payload)});
  return {status:response.status,body:await response.json()};
 };
 for(const id of ['a','b']){
  const result=await post('/admin/stations',{stationId:'rink-'+id,publicKey:keys[id].publicKey.export({format:'pem',type:'spki'})},{'x-admin-key':ADMIN});
  assert.equal(result.status,201);
 }
 assert.equal((await post('/admin/assignments',{gameId,stationId:'rink-a'},{'x-admin-key':ADMIN})).status,201);
 const files={a:path.join(dir,'rink-a.sqlite'),b:path.join(dir,'rink-b.sqlite')};
 const a=new Authority({dbPath:files.a,gameId}),b=new Authority({dbPath:files.b,gameId});
 t.after(async()=>{a.close();b.close();await central.close();fs.rmSync(dir,{recursive:true,force:true});});
 const client=(id,epoch=1,fetchImpl=fetch)=>new RinkSyncClient({dbPath:files[id],remoteUrl:base,gameId,stationId:'rink-'+id,privateKey:keys[id].privateKey,epoch,fetchImpl});
 const snapshot=()=>central.snapshot(gameId);
 return {a,b,files,base,post,keys,gameId,client,snapshot,central};
}
let n=0;
const command=(authority,value)=>authority.command(value,{actor:'fictional-scorekeeper',key:'distributed-'+(++n)+'-'+crypto.randomUUID()});
test('DISTRIBUTED-001: disconnected owner keeps local journal and exactly-once reconciliation after reconnect',async t=>{
 const x=await setup(t);
 command(x.a,{type:'GOALIE_CHANGED',team:'home',player:'29',reason:'Starter'});
 command(x.a,{type:'SHOT_RECORDED',team:'away'});
 command(x.a,{type:'PENALTY_ASSESSED',team:'home',player:'11',infraction:'Tripping',duration:120});
 command(x.a,{type:'GOAL_RECORDED',team:'home',scorer:'17',assist1:'8',assist2:'None'});
 command(x.a,{type:'GOALIE_CHANGED',team:'home',player:'31',reason:'Goalie change'});
 const unreachable=async()=>{throw Error('Synthetic network partition');};
 await assert.rejects(()=>x.client('a',1,unreachable).flush(),/network partition/);
 assert.equal(x.a.db.prepare('SELECT COUNT(*) n FROM sync_outbox WHERE delivered=0').get().n,5);
 assert.equal(x.snapshot().lastSequence,0);
 const uploaded=await x.client('a').flush();
 assert.deepEqual(uploaded.accepted,[1,2,3,4,5]);
 assert.equal(x.snapshot().lastSequence,5);
 assert.deepEqual(x.snapshot().score,{home:1,away:0});
 assert.deepEqual(x.snapshot().shots,{home:1,away:1});
 assert.equal(x.snapshot().events.filter(e=>e.type==='GOALIE_CHANGED').length,2);
 assert.equal((await x.client('a').flush()).empty,true);
 x.a.db.exec('UPDATE sync_outbox SET delivered=0');
 const retry=await x.client('a').flush();
 assert.deepEqual(retry.duplicates,[1,2,3,4,5]);
 assert.equal(x.snapshot().lastSequence,5);
 assert.equal(x.a.db.prepare('SELECT COUNT(*) n FROM sync_outbox WHERE delivered=0').get().n,0);
});
test('DISTRIBUTED-002: two laptops cannot publish conflicting ownership or replay after transfer back',async t=>{
 const x=await setup(t);
 command(x.a,{type:'SHOT_RECORDED',team:'home'});
 command(x.b,{type:'GOAL_RECORDED',team:'away',scorer:'12',assist1:'None',assist2:'None'});
 assert.deepEqual((await x.client('a').flush()).accepted,[1]);
 await assert.rejects(()=>x.client('b').flush(),e=>e.status===409&&/Another station owns/.test(e.message));
 assert.equal(x.b.db.prepare('SELECT delivered FROM sync_outbox').get().delivered,0);
 assert.equal(x.snapshot().lastSequence,1);
 assert.equal((await x.post('/admin/games/transfer',{gameId:x.gameId,stationId:'rink-b'},{'x-admin-key':ADMIN})).body.epoch,2);
 command(x.a,{type:'SHOT_RECORDED',team:'home'});
 await assert.rejects(()=>x.client('a').flush(),e=>e.status===409&&/Another station owns/.test(e.message));
 assert.equal(x.a.db.prepare('SELECT COUNT(*) n FROM sync_outbox WHERE delivered=0').get().n,1);
 assert.equal(x.snapshot().lastSequence,1);
});
test('DISTRIBUTED-003: signed fencing epochs reject stale clients even after ownership cycles',async t=>{
 const x=await setup(t);
 command(x.a,{type:'SHOT_RECORDED',team:'home'});
 await x.client('a').flush();
 assert.equal((await x.post('/admin/games/transfer',{gameId:x.gameId,stationId:'rink-b'},{'x-admin-key':ADMIN})).body.epoch,2);
 // Standby must be restored to central sequence 1 before it can write seq 2.
 // A locally divergent event at seq 1 is rejected rather than silently merged.
 command(x.b,{type:'SHOT_RECORDED',team:'away'});
 await assert.rejects(()=>x.client('b',2).flush(),e=>e.status===409&&/Conflicting replay/.test(e.message));
 assert.equal(x.snapshot().lastSequence,1);
 assert.equal((await x.post('/admin/games/transfer',{gameId:x.gameId,stationId:'rink-a'},{'x-admin-key':ADMIN})).body.epoch,3);
 command(x.a,{type:'SHOT_RECORDED',team:'home'});
 await assert.rejects(()=>x.client('a',1).flush(),e=>e.status===409&&e.response.expectedEpoch===3);
 assert.equal(x.a.db.prepare('SELECT COUNT(*) n FROM sync_outbox WHERE delivered=0').get().n,1);
 const result=await x.client('a',3).flush();
 assert.deepEqual(result.accepted,[2]);
 assert.equal(x.snapshot().lastSequence,2);
 assert.deepEqual(x.snapshot().shots,{home:2,away:0});
});
test('DISTRIBUTED-004: lost acknowledgement, retry and conflicting replay are safe',async t=>{
 const x=await setup(t);
 command(x.a,{type:'GOAL_RECORDED',team:'home',scorer:'17',assist1:'None',assist2:'None'});
 const lost=async(url,opts)=>{
  const response=await fetch(url,opts);
  assert.equal(response.status,200);
  throw Error('Synthetic acknowledgement lost');
 };
 await assert.rejects(()=>x.client('a',1,lost).flush(),/acknowledgement lost/);
 assert.equal(x.snapshot().lastSequence,1);
 assert.equal(x.a.db.prepare('SELECT delivered FROM sync_outbox').get().delivered,0);
 assert.deepEqual((await x.client('a').flush()).duplicates,[1]);
 assert.equal(x.a.db.prepare('SELECT delivered FROM sync_outbox').get().delivered,1);
 const bad={gameId:x.gameId,stationId:'rink-a',epoch:1,events:[{seq:1,id:'forged-event',type:'GOAL_RECORDED',data:{team:'away'}}]};
 assert.equal((await x.post('/api/ingest/v1/batches',bad,{'x-station-signature':signBatch(x.keys.a.privateKey,bad)})).status,409);
 assert.deepEqual(x.snapshot().score,{home:1,away:0});
 const db=x.central.db;
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});
