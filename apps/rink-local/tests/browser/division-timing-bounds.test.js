'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validateTiming,periodLength,phaseLength,verifyTime,nextPeriod}=require('../../server/game-timing-rules');
const {Authority}=require('../../server/authority-sqlite');
const {LeagueStore}=require('../../server/league-store');
const rules={periodCount:3,periodSeconds:720,periodLengths:[720,600,480],warmupSeconds:180,intermissionSeconds:90,clockMode:'HYBRID',showAuxiliaryClock:true};
test('configurable periods, phases and integer bounds',()=>{
 const r=validateTiming(rules);
 assert.deepEqual([1,2,3].map(n=>periodLength(r,n)),[720,600,480]);
 assert.equal(phaseLength(r,'WARMUP'),180);
 assert.equal(phaseLength(r,'INTERMISSION'),90);
 assert.equal(nextPeriod(1,r).seconds,600);
 assert.equal(nextPeriod(2,r).seconds,480);
 assert.throws(()=>nextPeriod(3,r),/No additional/);
 for(const bad of [-1,721,NaN,1.5,Infinity,'30'])assert.throws(()=>verifyTime(bad,r,'PERIOD',1));
 assert.equal(verifyTime(480,r,'PERIOD',3),480);
 assert.throws(()=>verifyTime(481,r,'PERIOD',3),/limits/);
});
test('reject invalid and inconsistent timing rules',()=>{
 for(const bad of [{periodCount:0},{periodCount:10},{periodSeconds:59},{warmupSeconds:-1},{intermissionSeconds:3601},{clockMode:'SPEEDY'},{showAuxiliaryClock:'true'},{periodLengths:[720,600]},{periodLengths:[720,-2,480]},{timeoutsPerTeam:10},{timeoutSeconds:-1},{mercyRunningDifferential:-1}])assert.throws(()=>validateTiming(bad));
});
test('official actor rejects negative and overlong clocks and pins rules',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-division-timing-'));
 const file=path.join(dir,'game.sqlite');
 const a=new Authority({dbPath:file,timingRules:rules,timingVersion:'10UB-v2'});
 t.after(()=>{a.close();fs.rmSync(dir,{recursive:true,force:true});});
 let k=0;const cmd=c=>a.command(c,{actor:'operator',key:'period-bounds-'+(++k)});
 assert.equal(a.spectator().seconds,720);
 for(const bad of [-1,721,1.5,NaN])assert.throws(()=>cmd({type:'CLOCK_SYNCED',seconds:bad,reason:'arena sync'}));
 assert.equal(a.spectator().revision,0);
 cmd({type:'PERIOD_ENDED'});
 cmd({type:'PERIOD_ADVANCED'});
 assert.equal(a.spectator().period,2);
 assert.equal(a.spectator().seconds,600);
 assert.throws(()=>cmd({type:'CLOCK_UPDATED',action:'SET',seconds:601}),/limits/);
 assert.throws(()=>cmd({type:'CLOCK_SYNCED',seconds:-1,reason:'arrow -1s'}),/limits/);
 cmd({type:'CLOCK_SYNCED',seconds:599,reason:'arena -1s',scope:'GAME_AND_PENALTIES'});
 assert.equal(a.spectator().seconds,599);
 cmd({type:'PERIOD_ENDED'});
 cmd({type:'PERIOD_ADVANCED'});
 assert.equal(a.spectator().seconds,480);
 assert.throws(()=>cmd({type:'CLOCK_UPDATED',action:'SET',seconds:481}),/limits/);
 assert.throws(()=>cmd({type:'PERIOD_ADVANCED'}),/No additional/);
 assert.equal(a.spectator().timingVersion,'10UB-v2');
});
test('division version persists and cannot change once live games exist',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-league-timing-'));
 const store=new LeagueStore(path.join(dir,'league.sqlite'),{seedDemo:true});
 t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 assert.equal(store.timingForDivision('demo-10u').periodCount,3);
 // Seed has live and final games, so a rule change must never rewrite their rules.
 assert.throws(()=>store.configureDivisionTiming('demo-10u','revision2',rules),/Cannot change division timing policy/);
 assert.equal(store.timingForDivision('demo-10u').periodSeconds,900);
});
