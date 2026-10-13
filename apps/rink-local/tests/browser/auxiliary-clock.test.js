'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {AuxiliaryClock}=require('../../server/auxiliary-clock');
const {createRinkServer}=require('../../server/rink-server');
const timing={periodCount:3,periodSeconds:720,warmupSeconds:180,intermissionSeconds:75,overtimeSeconds:0};
test('warm-up and intermission have independent configurable countdowns and durable audit',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-aux-'));const db=new DatabaseSync(path.join(dir,'aux.sqlite'));
 let ns=0n;const now=()=>ns;const actions=[];
 const aux=new AuxiliaryClock(db,'game',timing,{now,audit:(act,details)=>actions.push({act,details})});
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 assert.equal(aux.snapshot().seconds,180);
 assert.equal(aux.command({action:'START'}).running,true);
 ns=3_000_000_000n;assert.equal(aux.snapshot().seconds,177);
 assert.equal(aux.command({action:'PAUSE'}).seconds,177);
 assert.equal(aux.command({action:'RESET',phase:'INTERMISSION'}).seconds,75);
 aux.command({action:'START'});ns+=10_000_000_000n;
 assert.equal(aux.command({action:'PAUSE'}).seconds,65);
 assert.equal(db.prepare('SELECT count(*) AS n FROM auxiliary_clock_history').get().n,5);
 assert.ok(actions.some(a=>a.act==='AUX_TIMER_PAUSE'));
});
test('auxiliary timer refuses official game clock overlap and survives database reopen paused',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-aux-')),f=path.join(dir,'aux.sqlite');let db=new DatabaseSync(f);let clock=new AuxiliaryClock(db,'game',timing);
 assert.throws(()=>clock.command({action:'START'},{officialClockRunning:true}),/Stop official/);
 clock.command({action:'RESET',phase:'INTERMISSION'});clock.command({action:'START'});db.close();
 db=new DatabaseSync(f);clock=new AuxiliaryClock(db,'game',timing);assert.equal(clock.snapshot().running,false);assert.equal(clock.snapshot().phase,'INTERMISSION');
 db.close();fs.rmSync(dir,{recursive:true,force:true});
});
test('protected HTTP auxiliary timer endpoints do not alter game/penalty clock',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-aux-http-')),app=createRinkServer({dbPath:path.join(dir,'rink.sqlite'),port:0,operatorKey:'test-clock-key'});
 const addr=await app.start(),base='http://127.0.0.1:'+addr.port;
 try{
  const unauth=await fetch(base+'/api/operator/aux-clock');assert.equal(unauth.status,403);
  const h={'X-Operator-Key':'test-clock-key'};
  const get=async()=> (await fetch(base+'/api/operator/aux-clock',{headers:h})).json();
  const post=async(body)=>fetch(base+'/api/operator/aux-clock',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const before=await (await fetch(base+'/api/games/demo/snapshot')).json();
  let r=await post({action:'RESET',phase:'INTERMISSION'});assert.equal(r.status,200);
  assert.equal((await get()).seconds,120);
  r=await post({action:'START'});assert.equal(r.status,200);
  const gameStart=await fetch(base+'/api/operator/command',{method:'POST',headers:{...h,'Idempotency-Key':'aux-regulation-block-001','Content-Type':'application/json'},body:JSON.stringify({type:'CLOCK_UPDATED',action:'START',seconds:900})});
  assert.equal(gameStart.status,400);
  assert.match((await gameStart.json()).error,/Pause warm-up/);
  r=await post({action:'PAUSE'});assert.equal(r.status,200);
  const after=await (await fetch(base+'/api/games/demo/snapshot')).json();
  assert.equal(after.seconds,before.seconds);
  assert.deepEqual(after.shots,before.shots);
  assert.deepEqual(after.scores,before.scores);
  assert.ok(app.authority.db.prepare('SELECT COUNT(*) AS n FROM auxiliary_clock_history').get().n>=3);
 }finally{await app.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
