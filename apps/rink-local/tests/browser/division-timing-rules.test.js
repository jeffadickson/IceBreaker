'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Authority}=require('../../server/authority-sqlite');
const {LeagueStore}=require('../../server/league-store');
const {validateTiming,phaseLength}=require('../../server/game-timing-rules');
test('division timing rules reject negative and overlong periods and define warmup/intermission',()=>{
 const timing=validateTiming({periodCount:2,periodSeconds:720,warmupSeconds:240,intermissionSeconds:90});
 assert.equal(phaseLength(timing,'WARMUP'),240);assert.equal(phaseLength(timing,'INTERMISSION'),90);
 assert.throws(()=>validateTiming({periodSeconds:-1}),/Invalid timing rule/);
 assert.throws(()=>validateTiming({periodSeconds:5000}),/Invalid timing rule/);
 assert.throws(()=>validateTiming({periodCount:0}),/Invalid timing rule/);
});
test('clock limits, nudge and division period cap are enforced with pinned game rules',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-timing-')),file=path.join(dir,'game.db'),timing={periodCount:2,periodSeconds:720,warmupSeconds:240,intermissionSeconds:90,overtimeSeconds:0};
 const a=new Authority({dbPath:file,timingRules:timing,timingVersion:'10U-A-v2'});
 t.after(()=>{a.close();fs.rmSync(dir,{recursive:true,force:true});});
 let i=0;const cmd=c=>a.command(c,{actor:'timer-test',key:'period-test-'+(++i)});
 assert.equal(a.state.seconds,720);
 assert.throws(()=>cmd({type:'CLOCK_SYNCED',seconds:-1,reason:'invalid'}),/limits/);
 assert.throws(()=>cmd({type:'CLOCK_SYNCED',seconds:721,reason:'invalid'}),/limits/);
 assert.throws(()=>cmd({type:'CLOCK_UPDATED',action:'SET',seconds:721}),/limits/);
 cmd({type:'CLOCK_SYNCED',seconds:719,reason:'minus 1s',scope:'GAME_ONLY'});
 assert.equal(a.spectator().seconds,719);
 cmd({type:'PERIOD_ADVANCED'});assert.equal(a.state.period,2);assert.equal(a.state.seconds,720);
 assert.throws(()=>cmd({type:'PERIOD_ADVANCED'}),/No additional regulation period/);
});
test('game rules persist across restart and cannot silently change',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-timing-persist-')),file=path.join(dir,'game.db');
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const rules={periodCount:3,periodSeconds:600,warmupSeconds:120,intermissionSeconds:60,overtimeSeconds:0};
 let a=new Authority({dbPath:file,timingRules:rules,timingVersion:'10U-B-v1'});a.close();
 a=new Authority({dbPath:file});assert.equal(a.timingRules.periodSeconds,600);assert.equal(a.timingVersion,'10U-B-v1');a.close();
 assert.throws(()=>new Authority({dbPath:file,timingRules:{periodSeconds:900},timingVersion:'10U-B-v2'}),/pinned timing policy/);
});
test('division rules are versioned and locked after a completed game',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-division-timing-')),file=path.join(dir,'league.db');const league=new LeagueStore(file,{seedDemo:true});t.after(()=>{league.close();fs.rmSync(dir,{recursive:true,force:true});});
 const d='demo-10u';assert.equal(league.timingForDivision(d).periodSeconds,900);
 const r=league.configureDivisionTiming(d,'10U-12M-v1',{periodCount:3,periodSeconds:720,warmupSeconds:180,intermissionSeconds:60,overtimeSeconds:0});
 assert.equal(r.periodSeconds,720);assert.equal(league.timingForDivision(d).version,'10U-12M-v1');
 assert.throws(()=>league.configureDivisionTiming(d,'10U-new',{periodSeconds:800}),/Cannot change division timing policy/);
});
