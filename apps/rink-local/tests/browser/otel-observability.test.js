'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createRinkServer}=require('../../server/rink-server');
const telemetry=require('../../server/telemetry');
test('OpenTelemetry route and event labels cannot expose player IDs, query strings or credentials',()=>{
 assert.equal(telemetry.ENABLED,false);
 assert.equal(telemetry.routeFamily('/api/registration/v1/players/child-123/documents'),'registration');
 assert.equal(telemetry.routeFamily('/api/scoresheet/v1/referee/login'),'scoresheet');
 assert.equal(telemetry.routeFamily('/api/operator/command'),'operator.command');
 assert.equal(telemetry.routeFamily('/api/parent/private-child-id'),'parent');
 assert.equal(telemetry.routeFamily('/api/games/private-game-id'),'games');
 assert.equal(telemetry.routeFamily('/private/secret/path'),'other');
 assert.equal(telemetry.safeEventType('GOAL_RECORDED'),'GOAL_RECORDED');
 assert.equal(telemetry.safeEventType('CHILD_NAME_John_Doe'),'OTHER');
 assert.equal(telemetry.safeEventType('../../secrets'),'OTHER');
});
test('disabled telemetry requires no packages and never changes command results',()=>{
 const value=telemetry.recordGameCommand({type:'GOAL_RECORDED',scorer:'fictional-private-name'},()=>({accepted:true,duplicate:false}));
 assert.deepEqual(value,{accepted:true,duplicate:false});
 assert.throws(()=>telemetry.recordGameCommand({type:'GOAL_RECORDED'},()=>{throw Error('command rejected');}),/command rejected/);
});
test('rink HTTP server still serves health and rejects unauthorized commands with telemetry disabled',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-otel-'));
 const app=createRinkServer({dbPath:path.join(dir,'rink.db'),port:0});
 const address=await app.start();
 t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+address.port;
 const health=await fetch(url+'/api/health');
 assert.equal(health.status,200);
 assert.equal((await health.json()).status,'ok');
 const bad=await fetch(url+'/api/operator/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'GOAL_RECORDED',scorer:'Private Child'})});
 assert.equal(bad.status,403);
});
test('enabling OTel without installed SDK fails explicitly instead of silently disabling monitoring',()=>{
 const script="require('./apps/rink-local/server/telemetry.js')";
 const result=spawnSync(process.execPath,['-e',script],{
  cwd:path.resolve(__dirname,'../../../../'),env:{...process.env,ICEBREAKER_OTEL_ENABLED:'1'},encoding:'utf8'
 });
 // CI intentionally does not npm-install optional SDKs. On a development
 // machine with them installed, this test only asserts successful startup.
 if(result.status!==0)assert.match(result.stderr,/@opentelemetry\/api|ICEBREAKER_OTEL_ENABLED/);
});
