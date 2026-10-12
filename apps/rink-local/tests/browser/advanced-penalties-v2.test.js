'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {penaltyClock}=require('../../server/penalty-clock');
const E=(id,type,team,seconds,details={},period=1)=>({id,type,team,seconds,period,details});
test('third overlapping minor is queued and serves only when a slot opens',()=>{
 const es=[E('a','PENALTY_ASSESSED','away',900,{classification:'MINOR',duration:120}),E('b','PENALTY_ASSESSED','away',880,{classification:'MINOR',duration:120}),E('c','PENALTY_ASSESSED','away',860,{classification:'MINOR',duration:120})];
 const before=penaltyClock(es,1,850);assert.deepEqual(before.teamStrength,{home:5,away:3});assert.equal(before.active.find(x=>x.id==='c').status,'queued');assert.equal(before.active.find(x=>x.id==='c').remaining,120);
 const after=penaltyClock(es,1,770);assert.equal(after.active.find(x=>x.id==='c').status,'serving');assert.equal(after.active.find(x=>x.id==='c').remaining,110);
});
test('delayed penalty does not run until whistle',()=>{
 const es=[E('a','PENALTY_DELAYED','away',900,{classification:'MINOR',duration:120}),E('b','PENALTY_WHISTLE',null,850)];
 assert.equal(penaltyClock(es,1,840).active[0].remaining,110);
});
test('delayed penalty can be waved without assessing penalty',()=>{
 const es=[E('a','PENALTY_DELAYED','away',900,{classification:'MINOR',duration:120}),E('b','PENALTY_DELAYED_WAVED',null,880,{delayedEventId:'a'})];
 const r=penaltyClock(es,1,860);assert.equal(r.active.length,0);assert.equal(r.delayed.length,0);
});
test('substitute is carried in penalty projection, not substituted for the offender',()=>{
 const r=penaltyClock([E('a','PENALTY_ASSESSED','home',900,{classification:'MINOR',duration:120,player:'1',servedBy:'21'})],1,890);
 assert.equal(r.active[0].player,'1');assert.equal(r.active[0].servedBy,'21');
});
test('configured minimum skating strength is honored',()=>{
 const es=[0,1,2].map((i)=>E(String(i),'PENALTY_ASSESSED','away',900-i*10,{classification:'MINOR',duration:120}));
 assert.equal(penaltyClock(es,1,850,900,{minimumSkaters:4}).teamStrength.away,4);
});