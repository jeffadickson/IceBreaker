'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {penaltyClock}=require('../../server/penalty-clock');
let seq=0;
const evt=(type,team,seconds,details={})=>({id:'event'+(++seq),type,team,period:1,seconds,details});
test('a 5-on-3 becomes 5-on-4 after a power-play goal, preserving the second minor',()=>{
 const es=[evt('PENALTY_ASSESSED','away',900,{classification:'MINOR',duration:120}),evt('PENALTY_ASSESSED','away',870,{classification:'MINOR',duration:120}),evt('GOAL_RECORDED','home',840)];
 const r=penaltyClock(es,1,840);assert.deepEqual(r.teamStrength,{home:5,away:4});assert.equal(r.active.length,1);assert.equal(r.active[0].remaining,90);
});
test('a shorthanded goal does not release an opponent minor',()=>{
 const es=[evt('PENALTY_ASSESSED','home',900,{classification:'MINOR',duration:120}),evt('GOAL_RECORDED','home',870)];
 const r=penaltyClock(es,1,870);assert.equal(r.active[0].remaining,90);
});
test('major penalty survives a power play goal',()=>{
 const es=[evt('PENALTY_ASSESSED','away',900,{classification:'MAJOR',duration:300}),evt('GOAL_RECORDED','home',870)];
 assert.equal(penaltyClock(es,1,870).active[0].remaining,270);
});
test('double minor goal clears only its current segment',()=>{
 const es=[evt('PENALTY_ASSESSED','away',900,{classification:'DOUBLE_MINOR',duration:240}),evt('GOAL_RECORDED','home',870)];
 const r=penaltyClock(es,1,870);assert.equal(r.active[0].remaining,120);assert.equal(r.powerPlay,'home');
});
test('explicit coincidental penalties do not change team strength',()=>{
 const es=[evt('PENALTY_ASSESSED','away',900,{classification:'MINOR',duration:120,coincidental:true}),evt('PENALTY_ASSESSED','home',900,{classification:'MINOR',duration:120,coincidental:true})];
 const r=penaltyClock(es,1,860);assert.equal(r.powerPlay,null);assert.deepEqual(r.teamStrength,{home:5,away:5});
});
test('clock set does not retroactively advance penalty service',()=>{
 const es=[evt('PENALTY_ASSESSED','away',900,{classification:'MINOR',duration:120}),evt('CLOCK_UPDATED',null,800,{action:'SET'})];
 assert.equal(penaltyClock(es,1,800).active[0].remaining,120);
});