'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Authority}=require('../../server/authority-sqlite');
test('goalie substitutions attribute saves and goals to actual occupant, including skater in net',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-goalies-')),file=path.join(dir,'game.db');
 let a=new Authority({dbPath:file});t.after(()=>{a.close();fs.rmSync(dir,{recursive:true,force:true});});
 let i=0;const cmd=c=>a.command(c,{actor:'scorekeeper',key:'goalie-stats-'+(++i)});
 const swap=(team,player)=>cmd({type:'GOALIE_CHANGED',team,player,reason:'Substitution'});
 swap('home','29');
 cmd({type:'SHOT_RECORDED',team:'away'});
 cmd({type:'GOAL_RECORDED',team:'away',scorer:'7',assist1:'None',assist2:'None'});
 swap('home','17'); // Roster skater temporarily playing goalie
 cmd({type:'SHOT_RECORDED',team:'away'});
 cmd({type:'GOAL_RECORDED',team:'away',scorer:'7',assist1:'None',assist2:'None'});
 swap('home',null); // Empty net
 cmd({type:'GOAL_RECORDED',team:'away',scorer:'7',assist1:'None',assist2:'None'});
 assert.deepEqual(a.spectator().goalieStats.home['29'],{shotsAgainst:2,goalsAgainst:1,saves:1});
 assert.deepEqual(a.spectator().goalieStats.home['17'],{shotsAgainst:2,goalsAgainst:1,saves:1});
 assert.equal(a.spectator().goalies.home,null);
 assert.equal(a.spectator().shots.away,5);
 const rev=a.spectator().revision;a.close();
 a=new Authority({dbPath:file});assert.equal(a.spectator().revision,rev);
 assert.equal(a.spectator().goalieStats.home['17'].saves,1);
 assert.equal(a.spectator().goalies.home,null);
 assert.throws(()=>cmd({type:'GOALIE_CHANGED',team:'away',player:'bad',reason:'test'}),/Goalie/);
});
