'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {LeagueStore}=require('../../server/league-store');
const {TeamAccounts}=require('../../server/team-accounts');
const {createRinkServer}=require('../../server/rink-server');
test('bound game refuses unsigned lineups, then signs exact confirmed lineup revision',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'icebreaker-pregame-e2e-'));
 const file=path.join(dir,'game.sqlite');const league=new LeagueStore(file,{seedDemo:true});
 const game=league.db.prepare("SELECT * FROM games WHERE status='scheduled' LIMIT 1").get();assert.ok(game);league.close();
 const team=new TeamAccounts(file);
 const app=createRinkServer({dbPath:file,port:0,operatorKey:'test-operator',leagueGameId:game.id});
 const addr=await app.start(),base='http://127.0.0.1:'+addr.port;
 const op=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Operator-Key':'test-operator','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)});
 try{
  const unready=await fetch(base+'/api/scoresheet/v1/pregame',{headers:{'X-Operator-Key':'test-operator'}});assert.equal((await unready.json()).ready,false);
  // Simulate a completed imported game to exercise the certification gate independently of pregame operator checks.
  app.authority.command({type:'GAME_ENDED'},{actor:'test-harness',key:crypto.randomUUID()});
  const blocked=await op('/api/scoresheet/v1/submit',{});assert.equal(blocked.status,409);
  for(const tid of [game.home_team_id,game.away_team_id]){
    const roster=team.roster(tid);assert.ok(roster.length>0);const manager=team.createUser(tid+'@test.invalid','sample-secret-password',tid);
    team.confirmLineup(tid,game.id,manager.id,{playerIds:roster.slice(0,2).map(x=>x.id),expectedRosterRevision:team.currentRevision(tid)});
  }
  const pre=await fetch(base+'/api/scoresheet/v1/pregame',{headers:{'X-Operator-Key':'test-operator'}});assert.equal((await pre.json()).ready,true);
  const resp=await op('/api/scoresheet/v1/submit',{});assert.equal(resp.status,201,await resp.clone().text());const submitted=await resp.json();
  assert.equal(submitted.document.pregameEvidence.ready,true);
  assert.match(submitted.document.pregameDigest,/^[a-f0-9]{64}$/);
 }finally{await app.stop();team.close();fs.rmSync(dir,{recursive:true,force:true});}
});
