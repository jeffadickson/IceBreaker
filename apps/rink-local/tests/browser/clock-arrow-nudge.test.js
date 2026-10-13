'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Authority}=require('../../server/authority-sqlite');

test('one-second arrow nudges adjust game and active penalty clocks while stopped',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-clock-arrows-'));
 const a=new Authority({dbPath:path.join(dir,'game.sqlite')});
 t.after(()=>{a.close();fs.rmSync(dir,{recursive:true,force:true});});
 let n=0;const cmd=c=>a.command(c,{actor:'rink-operator',key:'clock-arrow-'+(++n)});
 cmd({type:'PENALTY_ASSESSED',team:'away',player:'22',infraction:'Tripping',duration:120,classification:'MINOR'});
 const first=a.spectator();
 assert.equal(first.seconds,900);assert.equal(first.penalties.active[0].remaining,120);
 cmd({type:'CLOCK_SYNCED',seconds:899,scope:'GAME_AND_PENALTIES',reason:'operator arrow -1s'});
 assert.equal(a.spectator().seconds,899);assert.equal(a.spectator().penalties.active[0].remaining,119);
 cmd({type:'CLOCK_SYNCED',seconds:900,scope:'GAME_AND_PENALTIES',reason:'operator arrow +1s'});
 assert.equal(a.spectator().seconds,900);assert.equal(a.spectator().penalties.active[0].remaining,120);
 cmd({type:'CLOCK_SYNCED',seconds:899,scope:'GAME_ONLY',reason:'display-only correction'});
 assert.equal(a.spectator().penalties.active[0].remaining,120);
 assert.deepEqual(a.spectator().scores,{home:0,away:0});
 assert.deepEqual(a.spectator().shots,{home:0,away:0});
 const events=a.state.events.filter(e=>e.type==='CLOCK_SYNCED');assert.equal(events.length,3);
 assert.equal(events[0].details.scope,'GAME_AND_PENALTIES');
 assert.equal(events[2].details.scope,'GAME_ONLY');
 assert.match(fs.readFileSync(a.auditPath,'utf8'),/CLOCK_SYNCED/);
});
test('rejects invalid adjustment scope and running-clock adjustments',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-clock-arrows-'));const a=new Authority({dbPath:path.join(dir,'g.sqlite')});
 t.after(()=>{a.close();fs.rmSync(dir,{recursive:true,force:true});});let n=0;const cmd=c=>a.command(c,{actor:'rink-operator',key:'clock-arrow-'+(++n)});
 assert.throws(()=>cmd({type:'CLOCK_SYNCED',seconds:899,scope:'UNKNOWN',reason:'bad'}),/scope/);
 cmd({type:'CLOCK_UPDATED',action:'START',seconds:900});
 assert.throws(()=>cmd({type:'CLOCK_SYNCED',seconds:899,scope:'GAME_AND_PENALTIES',reason:'while live'}),/Stop the game clock/);
});
