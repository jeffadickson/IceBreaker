'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Authority}=require('../../server/authority-sqlite');
const {reportFromState,renderReport}=require('../../server/game-report');
let n=0;function fixture(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'ib-v2-'));const a=new Authority({dbPath:path.join(d,'a.db')});t.after(()=>{a.close();fs.rmSync(d,{recursive:true,force:true})});return a;}
const command=(a,c)=>a.command(c,{actor:'test-operator',key:'scenario-v2-'+(++n)});
test('game journal drives goal, shots, power-play expiry and report without duplicate shot',t=>{
 const a=fixture(t);
 command(a,{type:'PENALTY_ASSESSED',team:'away',player:'22',infraction:'Tripping',duration:120,classification:'MINOR'});
 command(a,{type:'CLOCK_UPDATED',action:'START',seconds:900});a.clockAnchor-=30_000_000_000n;
 command(a,{type:'CLOCK_UPDATED',action:'STOP',seconds:900});
 command(a,{type:'SHOT_RECORDED',team:'home'});
 command(a,{type:'GOAL_RECORDED',team:'home',scorer:'TBD',assist1:'TBD',assist2:'None'});
 assert.deepEqual(a.spectator().scores,{home:1,away:0});assert.deepEqual(a.spectator().shots,{home:2,away:0});
 assert.equal(a.spectator().penalties.powerPlay,null);assert.equal(a.spectator().penalties.active.length,0);
 const r=reportFromState(a.state);assert.equal(r.status,'UNOFFICIAL');assert.equal(r.byPeriod[0].shots.home,2);assert.equal(r.byPeriod[0].goals.home,1);
 assert.match(renderReport(r),/Period-by-period/);
 const audit=fs.readFileSync(a.auditPath,'utf8');assert.match(audit,/COMMAND_COMMITTED/);
});
test('double minor leaves a 2-minute segment when scored against during power play',t=>{
 const a=fixture(t);command(a,{type:'PENALTY_ASSESSED',team:'away',player:'12',infraction:'High-sticking',duration:240,classification:'DOUBLE_MINOR'});
 command(a,{type:'GOAL_RECORDED',team:'home',scorer:'TBD',assist1:'None',assist2:'None'});
 assert.equal(a.spectator().penalties.active[0].remaining,120);
});