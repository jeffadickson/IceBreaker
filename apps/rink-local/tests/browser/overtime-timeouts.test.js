'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Authority}=require('../../server/authority-sqlite');
function game(t,rules){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-extra-rules-'));
 const a=new Authority({dbPath:path.join(dir,'game.db'),timingRules:rules});
 t.after(()=>{a.close();fs.rmSync(dir,{recursive:true,force:true});});
 let n=0;
 return {a,cmd:c=>a.command(c,{actor:'test-operator',key:'extra-rules-'+(++n)})};
}
test('timeouts are limited per team, journaled and independent of penalty clock',t=>{
 const {a,cmd}=game(t,{periodCount:1,periodSeconds:600,timeoutSeconds:60,timeoutsPerTeam:1});
 assert.throws(()=>cmd({type:'TIMEOUT_TAKEN',team:'nobody'}),/Timeout/);
 cmd({type:'TIMEOUT_TAKEN',team:'home'});
 assert.equal(a.spectator().timeouts.home,1);
 assert.equal(a.spectator().seconds,600);
 assert.throws(()=>cmd({type:'TIMEOUT_TAKEN',team:'home'}),/Timeout/);
 cmd({type:'TIMEOUT_TAKEN',team:'away'});
 assert.deepEqual(a.spectator().timeouts,{home:1,away:1});
 cmd({type:'CLOCK_UPDATED',action:'START',seconds:600});
 assert.throws(()=>cmd({type:'TIMEOUT_TAKEN',team:'away'}),/Timeout/);
 assert.equal(a.state.events.filter(x=>x.type==='TIMEOUT_TAKEN').length,2);
});
test('overtime requires a tie and ends by a sudden death goal',t=>{
 const {a,cmd}=game(t,{periodCount:1,periodSeconds:600,overtimeSeconds:300});
 cmd({type:'PERIOD_ENDED'});
 cmd({type:'OVERTIME_STARTED'});
 assert.equal(a.spectator().seconds,300);
 assert.equal(a.spectator().overtime,true);
 assert.throws(()=>cmd({type:'CLOCK_UPDATED',action:'SET',seconds:301}),/limits/);
 cmd({type:'GOAL_RECORDED',team:'home',scorer:'7',assist1:'None',assist2:'None'});
 assert.equal(a.spectator().ended,true);
 assert.equal(a.spectator().scores.home,1);
 assert.throws(()=>cmd({type:'SHOT_RECORDED',team:'away'}),/final/);
});
test('mercy running mode recomputes from authoritative goal differential',t=>{
 const {a,cmd}=game(t,{mercyRunningDifferential:2,clockMode:'STOP'});
 assert.equal(a.spectator().clockMode,'STOP');
 for(let i=0;i<2;i++)cmd({type:'GOAL_RECORDED',team:'home',scorer:'7',assist1:'None',assist2:'None'});
 assert.equal(a.spectator().clockMode,'RUNNING');
 for(let i=0;i<2;i++)cmd({type:'GOAL_RECORDED',team:'away',scorer:'7',assist1:'None',assist2:'None'});
 assert.equal(a.spectator().clockMode,'STOP');
});

test('hybrid mode switches at configured final-period threshold',t=>{
 const {a,cmd}=game(t,{periodCount:1,periodSeconds:600,clockMode:'HYBRID',hybridStopSeconds:120});
 assert.equal(a.spectator().clockMode,'RUNNING');
 cmd({type:'CLOCK_UPDATED',action:'SET',seconds:120});
 assert.equal(a.spectator().clockMode,'STOP');
 cmd({type:'CLOCK_UPDATED',action:'SET',seconds:121});
 assert.equal(a.spectator().clockMode,'RUNNING');
});
