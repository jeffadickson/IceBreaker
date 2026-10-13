'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LoginThrottle}=require('../../server/login-throttle');
const {createRinkServer}=require('../../server/rink-server');
test('STRIDE: throttling blocks repeated spoofing attempts without storing plaintext identities',()=>{
 let now=1_000;
 const limit=new LoginThrottle({maxFailures:3,windowMs:1000,clock:()=>now});
 assert.equal(limit.allowed('referee','127.0.0.1','official-42'),true);
 for(let i=0;i<3;i++)limit.failure('referee','127.0.0.1','official-42');
 assert.equal(limit.allowed('referee','127.0.0.1','official-42'),false);
 assert.equal(limit.allowed('staff','127.0.0.1','official-42'),true);
 assert.equal(limit.allowed('referee','127.0.0.2','official-42'),false);
 assert.equal([...limit.entries.keys()].some(k=>k.includes('official-42')),false);
 now+=1001;
 assert.equal(limit.allowed('referee','127.0.0.1','official-42'),true);
 limit.failure('referee','127.0.0.1','official-42');
 limit.success('referee','127.0.0.1','official-42');
 assert.equal(limit.allowed('referee','127.0.0.1','official-42'),true);
});
test('STRIDE: unauthenticated game mutation and referee review are rejected; login throttles',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-stride-'));
 const app=createRinkServer({dbPath:path.join(dir,'game.db'),port:0,operatorKey:'fake-operator-key'});
 const port=(await app.start()).port;
 t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+port;
 const post=(url,body,headers={})=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 const before=app.authority.state.revision;
 const unauthorized=await post('/api/operator/command',{type:'GOAL_RECORDED',team:'home',scorer:'17',assist1:'None',assist2:'None'},{'Idempotency-Key':'fake-request-0001'});
 assert.equal(unauthorized.status,403);
 assert.equal(app.authority.state.revision,before);
 const privateReview=await fetch(base+'/api/scoresheet/v1/review');
 assert.equal(privateReview.status,403);
 assert.equal(privateReview.headers.get('cache-control'),'no-store');
 for(let i=0;i<5;i++){
  const r=await post('/api/scoresheet/v1/referee/login',{refereeId:'fictional-referee',password:'wrong-password'});
  assert.equal(r.status,401);
 }
 const blocked=await post('/api/scoresheet/v1/referee/login',{refereeId:'fictional-referee',password:'wrong-password'});
 assert.equal(blocked.status,429);
});
test('STRIDE: family and staff sign-in are independently rate-limited',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-stride-reg-'));
 const app=createRinkServer({dbPath:path.join(dir,'game.db'),port:0,operatorKey:'fake-operator-key'});
 const port=(await app.start()).port;
 t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+port+'/api/registration/v1/';
 const post=(route,body)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 for(let i=0;i<5;i++){
  const r=await post('login',{email:'fake@example.invalid',password:'wrong'});
  assert.notEqual(r.status,200);
 }
 assert.equal((await post('login',{email:'fake@example.invalid',password:'wrong'})).status,429);
 // Separate role namespace cannot inherit staff lockout.
 assert.notEqual((await post('family/login',{email:'fake@example.invalid',password:'wrong'})).status,429);
});
