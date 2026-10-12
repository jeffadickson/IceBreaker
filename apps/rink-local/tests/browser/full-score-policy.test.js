'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../../web/tracker-model.js');
const server=require('../../server/live-server.js');
test('live parent tracker always shows true score regardless of mercy cap',()=>{
 const s={revision:15,period:3,seconds:83,running:true,scores:{home:11,away:2},mercy:{enabled:true,triggered:true,threshold:5,cap:5},events:[]};
 assert.equal(model.project(s).home,11);assert.equal(model.project(s).away,2);
 assert.deepEqual(server.publicScore(s.scores,s.mercy),{home:7,away:2});
});
test('spectator DTO contains full score and excludes mercy settings and operator data',()=>{
 const s=server.spectatorSnapshot();assert.equal(s.scorePolicy,'FULL_OFFICIAL');
 assert.equal('mercy' in s,false);assert.equal('actions' in s,false);
});
test('arena scoreboard projection has independent policy',()=>{
 assert.equal(server.arenaScoreboardSnapshot().scorePolicy,'MERCY_DISPLAY_CAP');
});
test('goal attribution correction does not create a second goal or change its score',()=>{
 const s={scores:{home:8,away:2},events:[
 {id:'g1',type:'GOAL_RECORDED',team:'home',period:2,seconds:700,details:{scorer:'TBD',assist1:'TBD',assist2:'None'}},
 {id:'c1',type:'GOAL_ATTRIBUTION_CORRECTED',team:'home',period:2,seconds:650,details:{originalEventId:'g1',scorer:'17',assist1:'8',assist2:'None'}}]};
 const v=model.project(s);assert.equal(v.home,8);assert.equal(v.feed.length,1);assert.equal(v.feed[0].scorer,'17');assert.equal(v.feed[0].corrected,true);
});
