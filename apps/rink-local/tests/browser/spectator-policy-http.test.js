'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'icebreaker-mercy-policy-'));
process.env.ICEBREAKER_DEMO_JOURNAL=path.join(dir,'journal.jsonl');
const {server}=require('../../server/live-server.js');
let base;
test.before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
test('parent tracker shows every goal and full score while arena scoreboard is mercy-capped',async()=>{
 for(let i=0;i<9;i++){
  const r=await fetch(base+'/api/operator/command',{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Operator-Key':'dev-only-change-me'},body:JSON.stringify({type:'GOAL_RECORDED',team:'home',scorer:'TBD',assist1:'None',assist2:'None'})});
  assert.equal(r.status,200);
 }
 const live=await (await fetch(base+'/api/games/demo/snapshot')).json();
 const arena=await (await fetch(base+'/api/games/demo/arena-scoreboard')).json();
 assert.deepEqual(live.scores,{home:9,away:0});
 assert.deepEqual(arena.scores,{home:5,away:0});
 assert.equal(live.scorePolicy,'FULL_OFFICIAL');
 assert.equal(arena.scorePolicy,'MERCY_DISPLAY_CAP');
 assert.equal(live.events.filter(e=>e.type==='GOAL_RECORDED').length,9);
 assert.equal('mercy' in live,false);
 assert.equal('events' in arena,false);
});
