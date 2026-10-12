'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {createRinkServer}=require('../../server/rink-server');const os=require('node:os');
const root=path.join(__dirname,'../../web');
test('video overlay transparent, read-only, includes scores shots period and clock',()=>{
 const html=fs.readFileSync(path.join(root,'overlay.html'),'utf8'),js=fs.readFileSync(path.join(root,'overlay.js'),'utf8');
 for(const id of ['home-score','away-score','home-shots','away-shots','game-clock','game-period','offline'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/background:transparent/);assert.match(js,/\/api\/games\/demo\/events/);assert.match(js,/\/api\/games\/demo\/arena-scoreboard/);
 assert.doesNotMatch(js,/\/api\/operator\/command|x-operator-key|POST/);assert.match(js,/15000/);
});
test('video overlay and its script served as public read-only browser source',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'icebreaker-overlay-'));const app=createRinkServer({dbPath:path.join(dir,'demo.db'),port:0});const addr=await app.start();try{
  const base=`http://127.0.0.1:${addr.port}`;
  for(const p of ['/overlay.html?layout=compact','/overlay.js']){const r=await fetch(base+p);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),p.includes('.js')?/javascript/:/html/);}
  const full=await (await fetch(base+'/api/games/demo/snapshot')).json();const arena=await (await fetch(base+'/api/games/demo/arena-scoreboard')).json();
  assert.deepEqual(full.shots,{home:0,away:0});assert.deepEqual(arena.shots,{home:0,away:0});assert.equal(full.scorePolicy,'FULL_OFFICIAL');
 }finally{await app.stop();fs.rmSync(dir,{recursive:true,force:true});}
});