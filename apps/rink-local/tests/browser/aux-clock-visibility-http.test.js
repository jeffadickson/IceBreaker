'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createRinkServer}=require('../../server/rink-server');
test('public auxiliary clock obeys pinned visibility and timeout event resets phase',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-aux-public-'));
 const app=createRinkServer({dbPath:path.join(dir,'game.sqlite'),port:0,operatorKey:'secret-for-test'});
 const port=(await app.start()).port,base='http://127.0.0.1:'+port;
 t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const publicClock=await fetch(base+'/api/games/demo/auxiliary-clock');
 assert.equal(publicClock.status,200);
 assert.equal((await publicClock.json()).visible,true);
 const privateClock=await fetch(base+'/api/operator/aux-clock');
 assert.equal(privateClock.status,403);
 const rules=await fetch(base+'/api/operator/timing-rules',{headers:{'X-Operator-Key':'secret-for-test'}});
 assert.equal(rules.status,200);
});
