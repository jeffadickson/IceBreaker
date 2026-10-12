const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'icebreaker-live-'));
process.env.ICEBREAKER_DEMO_JOURNAL=path.join(dir,'journal.jsonl');
const api=require('../../server/live-server.js');
const {server}=api;
let base;
test.before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});
test.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
async function cmd(payload,key='dev-only-change-me'){return fetch(base+'/api/operator/command',{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Operator-Key':key},body:JSON.stringify(payload)});}
async function snap(){return (await fetch(base+'/api/games/demo/snapshot')).json();}
test('spectator gateway serves actual browser page',async()=>{const r=await fetch(base+'/live.html');assert.equal(r.status,200);assert.match(await r.text(),/Pasadena Maple Leafs/);});
test('public endpoints never expose operator audit or true-score fields',async()=>{const s=await snap();assert.equal('actions' in s,false);assert.equal('officialScores' in s,false);assert.equal('journal' in s,false);});
test('unauthorized operator commands are rejected',async()=>{const r=await cmd({type:'GOAL_RECORDED',team:'home',scorer:'17',assist1:'None',assist2:'None'},'bad-key');assert.equal(r.status,403);});
test('goal, penalty, correction and period events stream in safe snapshot',async()=>{const g=await cmd({type:'GOAL_RECORDED',team:'home',scorer:'TBD',assist1:'TBD',assist2:'None'});assert.equal(g.status,200);const gid=(await g.json()).eventId;assert.ok(gid);assert.equal((await snap()).scores.home,1);
assert.equal((await cmd({type:'PENALTY_ASSESSED',team:'away',player:'22',infraction:'Tripping',duration:120})).status,200);
assert.equal((await cmd({type:'GOAL_ATTRIBUTION_CORRECTED',originalEventId:gid,scorer:'17',assist1:'8',assist2:'None'})).status,200);
assert.equal((await cmd({type:'PERIOD_ENDED'})).status,200);const s=await snap();assert.equal(s.events.length,4);assert.equal(s.events[2].details.originalEventId,gid);assert.equal(s.scores.home,1);assert.equal('operator' in s.events[0],false);});
test('SSE sends a full snapshot with revision on connect',async()=>{const ctrl=new AbortController();const r=await fetch(base+'/api/games/demo/events',{signal:ctrl.signal});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/event-stream/);const reader=r.body.getReader();const {value}=await reader.read();const chunk=new TextDecoder().decode(value);assert.match(chunk,/event: snapshot/);assert.match(chunk,/revision/);ctrl.abort();});
test('mercy cap never changes stored true score',()=>{assert.deepEqual(api.publicScore({home:11,away:2},{enabled:true,threshold:5,cap:5,triggered:true}),{home:7,away:2});});
test('invalid command cannot alter revision',async()=>{const before=(await snap()).revision;const r=await cmd({type:'GOAL_RECORDED',team:'home',scorer:'None',assist1:'None',assist2:'None'});assert.equal(r.status,400);assert.equal((await snap()).revision,before);});
test('append-only event journal exists for demo server',()=>{const lines=fs.readFileSync(process.env.ICEBREAKER_DEMO_JOURNAL,'utf8').trim().split('\n');assert.equal(lines.length,4);});
