'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createRinkServer}=require('../../server/rink-server');
let app,base,dir;const key='local-test-key';
async function post(route,body={},headers={}){return fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});}
const op=(route,body)=>post(route,body,{'X-Operator-Key':key});
const event=body=>post('/api/operator/command',body,{'X-Operator-Key':key,'Idempotency-Key':crypto.randomUUID()});
test.beforeEach(async()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-workflow-'));app=createRinkServer({dbPath:path.join(dir,'game.db'),port:0,operatorKey:key});base='http://127.0.0.1:'+(await app.start()).port;});
test.afterEach(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
async function referee(){await op('/api/scoresheet/v1/referees',{refereeId:'ref-one',password:'super-long-password-123',gameId:'demo'});return (await(await post('/api/scoresheet/v1/referee/login',{refereeId:'ref-one',password:'super-long-password-123'})).json()).token;}
const approval=s=>({revision:s.revision,digest:s.digest,decision:'APPROVE',attestation:'I have reviewed this exact scoresheet and intend to sign it'});
test('version-pinned workflow executes submit and sign, queues exact-revision deliveries once',async()=>{
 const token=await referee();await event({type:'GOAL_RECORDED',team:'home',scorer:'17',assist1:'None',assist2:'None'});await event({type:'GAME_ENDED'});
 const submission=await(await op('/api/scoresheet/v1/submit')).json();const sign=await post('/api/scoresheet/v1/sign',approval(submission),{Authorization:'Bearer '+token});assert.equal(sign.status,200);
 const runtime=app.authority.db.prepare('SELECT state,version,revision FROM workflow_instances').get();assert.equal(runtime.state,'CERTIFIED');assert.equal(runtime.revision,2);assert.equal(app.authority.db.prepare('SELECT count(*) n FROM certification_delivery_outbox').get().n,2);
 assert.equal((await post('/api/scoresheet/v1/sign',approval(submission),{Authorization:'Bearer '+token})).status,409);
 const workflow=await fetch(base+'/api/scoresheet/v1/workflow',{headers:{'X-Operator-Key':key}});assert.equal(workflow.status,200);assert.equal((await workflow.json()).history.length,2);
 const again=await op('/api/scoresheet/v1/deliver');assert.equal(again.status,200);const a=await again.json();assert.equal(a.blocked,2);assert.match(a.deliveries[0].details,/binding required/);
});
test('workflow survives restart and pins definition; no duplicate notification on retry',async()=>{
 const token=await referee();await event({type:'GAME_ENDED'});const sub=await(await op('/api/scoresheet/v1/submit')).json();await post('/api/scoresheet/v1/sign',approval(sub),{Authorization:'Bearer '+token});
 const file=path.join(dir,'game.db');await app.stop();app=createRinkServer({dbPath:file,port:0,operatorKey:key});base='http://127.0.0.1:'+(await app.start()).port;
 assert.equal(app.authority.db.prepare('SELECT state FROM workflow_instances').get().state,'CERTIFIED');assert.equal(app.authority.db.prepare('SELECT count(*) n FROM certification_delivery_outbox').get().n,2);
 const deliver=await op('/api/scoresheet/v1/deliver');assert.equal((await deliver.json()).blocked,2);const retry=await op('/api/scoresheet/v1/deliver');assert.equal((await retry.json()).blocked,0);
});
test('correction transition cannot skip amendment or reuse original digest',async()=>{
 const token=await referee();const goal=await(await event({type:'GOAL_RECORDED',team:'home',scorer:'17',assist1:'None',assist2:'None'})).json();await event({type:'GAME_ENDED'});const first=await(await op('/api/scoresheet/v1/submit')).json();
 await post('/api/scoresheet/v1/sign',{revision:first.revision,digest:first.digest,decision:'REQUEST_CORRECTION',reason:'Check assist'}, {Authorization:'Bearer '+token});
 assert.equal(app.authority.db.prepare('SELECT state FROM workflow_instances').get().state,'CORRECTION_REQUESTED');
 assert.equal((await op('/api/scoresheet/v1/submit')).status,409);
 const fixed=await op('/api/scoresheet/v1/correct',{revision:first.revision,digest:first.digest,originalEventId:goal.eventId,scorer:'17',assist1:'8',assist2:'None',reason:'Confirmed',idempotencyKey:crypto.randomUUID()});assert.equal(fixed.status,200);
 assert.equal(app.authority.db.prepare('SELECT state FROM workflow_instances').get().state,'AMENDED');
 const second=await(await op('/api/scoresheet/v1/submit')).json();assert.equal(second.revision,2);assert.equal(app.authority.db.prepare('SELECT state FROM workflow_instances').get().state,'SUBMITTED');
 assert.equal((await post('/api/scoresheet/v1/sign',approval(first),{Authorization:'Bearer '+token})).status,409);
 assert.equal((await post('/api/scoresheet/v1/sign',approval(second),{Authorization:'Bearer '+token})).status,200);
});
test('certified fixture publishes league standings and queues opted-in verified parent report once',async()=>{
 const {CertifiedDelivery}=require('../../server/certified-delivery');
 const {LeagueStore}=require('../../server/league-store');
 const token=await referee();
 // The fixture uses permanent player IDs; event attribution is by the rink's jersey number.
 await event({type:'GOAL_RECORDED',team:'home',scorer:'17',assist1:'8',assist2:'None'});
 await event({type:'SHOT_RECORDED',team:'away'});
 await event({type:'GAME_ENDED'});
 const s=await(await op('/api/scoresheet/v1/submit')).json();assert.equal((await post('/api/scoresheet/v1/sign',approval(s),{Authorization:'Bearer '+token})).status,200);
 const db=app.authority.db;
 db.prepare("INSERT INTO parent_users(id,email,email_verified,created_ms) VALUES('parent-1','parent@test.invalid',1,0)").run();
 db.prepare("INSERT INTO parent_favorites VALUES('parent-1','team','maple')").run();
 db.prepare("INSERT INTO parent_preferences VALUES('parent-1','certified',1)").run();
 const league=new LeagueStore(path.join(dir,'game.db'));
 const {ScoresheetCertification}=require('../../server/scoresheet-certification');
 const cert=new ScoresheetCertification(db,app.authority);
 const dispatcher=new CertifiedDelivery({db,workflow:cert.workflow,certification:cert,leagueStore:league,leagueGameId:'g07'});
 const r=dispatcher.run();assert.equal(r.delivered,2);assert.equal(r.blocked,0);
 const game=league.db.prepare("SELECT * FROM games WHERE id='g07'").get();assert.equal(game.status,'final');assert.equal(game.home_score,1);assert.equal(game.away_score,0);
 const goals=league.db.prepare("SELECT * FROM goal_attributions WHERE game_id='g07'").all();assert.equal(goals.length,1);assert.equal(goals[0].scorer_id,'m17');assert.equal(goals[0].assist1_id,'m8');
 assert.equal(db.prepare("SELECT count(*) n FROM parent_mail_outbox WHERE subject='IceBreaker certified game result'").get().n,1);
 assert.equal(dispatcher.run().delivered,0);assert.equal(db.prepare('SELECT count(*) n FROM certified_report_recipients').get().n,1);
 league.close();
});
test('retrying blocked work requires operator access and remains idempotent',async()=>{
 const token=await referee();await event({type:'GAME_ENDED'});const sheet=await(await op('/api/scoresheet/v1/submit')).json();await post('/api/scoresheet/v1/sign',approval(sheet),{Authorization:'Bearer '+token});
 assert.equal((await post('/api/scoresheet/v1/deliver/retry')).status,403);
 assert.equal((await(await op('/api/scoresheet/v1/deliver')).json()).blocked,2);
 assert.equal((await(await op('/api/scoresheet/v1/deliver/retry')).json()).retried,2);
 assert.equal((await(await op('/api/scoresheet/v1/deliver/retry')).json()).retried,0);
 assert.equal(app.authority.db.prepare("SELECT count(*) n FROM certification_delivery_outbox").get().n,2);
});
test('workflow policy change is rejected on database reopen',async()=>{
 const {WorkflowRuntime,policyFromFile}=require('../../server/workflow-runtime');
 const file=path.resolve(__dirname,'../../../../config/workflows/electronic-scoresheet-v2.5.json');
 const orig=policyFromFile(file);const altered={...orig,version:'99.0.0'};
 assert.throws(()=>new WorkflowRuntime(app.authority.db,'demo',altered),/pinned version/);
});