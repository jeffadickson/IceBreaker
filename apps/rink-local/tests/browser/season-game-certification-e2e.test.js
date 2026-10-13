'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {LeagueStore}=require('../../server/league-store');
const {TeamAccounts}=require('../../server/team-accounts');
const {createRinkServer}=require('../../server/rink-server');
test('SIM-003: manager lineups → timekeeper journal → goalie swaps → referee signature → league publication',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-full-game-')),file=path.join(dir,'league.db');
 const league=new LeagueStore(file,{seedDemo:true}),teams=new TeamAccounts(file);
 const game=league.db.prepare("SELECT * FROM games WHERE id='g10'").get();
 let app;
 t.after(async()=>{if(app)await app.stop();teams.close();league.close();fs.rmSync(dir,{recursive:true,force:true});});
 for(const id of [game.home_team_id,game.away_team_id]){
  const manager=teams.createUser(id+'@synthetic.invalid','fictional-manager-password',id);
  teams.confirmLineup(id,game.id,manager.id,{playerIds:teams.roster(id).map(p=>p.id),expectedRosterRevision:0});
 }
 app=createRinkServer({dbPath:file,port:0,operatorKey:'fictional-operator',leagueGameId:game.id});
 const base='http://127.0.0.1:'+(await app.start()).port;
 const post=async(route,body,headers={})=>{
  const res=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  return {status:res.status,body:await res.json()};
 };
 const op=(route,body)=>post(route,body,{'X-Operator-Key':'fictional-operator','Idempotency-Key':crypto.randomUUID()});
 const event=async body=>{const r=await op('/api/operator/command',body);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 const ready=await fetch(base+'/api/scoresheet/v1/pregame',{headers:{'X-Operator-Key':'fictional-operator'}});
 assert.equal((await ready.json()).ready,true);
 const ref=await op('/api/scoresheet/v1/referees',{refereeId:'fictional-official',password:'fictional-referee-password',gameId:'demo'});
 assert.equal(ref.status,201);
 const login=await post('/api/scoresheet/v1/referee/login',{refereeId:'fictional-official',password:'fictional-referee-password'});
 assert.equal(login.status,200);
 const hdr={Authorization:'Bearer '+login.body.token};
 await event({type:'GOALIE_CHANGED',team:'home',player:'31',reason:'Starting goalie'});
 await event({type:'GOALIE_CHANGED',team:'away',player:'29',reason:'Starting goalie'});
 await event({type:'SHOT_RECORDED',team:'away'});
 await event({type:'SHOT_RECORDED',team:'home'});
 await event({type:'PENALTY_ASSESSED',team:'away',player:'21',infraction:'Tripping',duration:120,classification:'MINOR'});
 await event({type:'GOALIE_CHANGED',team:'away',player:'21',reason:'Skater substitutes in goal'});
 await event({type:'GOAL_RECORDED',team:'home',scorer:'22',assist1:'9',assist2:'None'});
 await event({type:'SHOT_RECORDED',team:'home'});
 await event({type:'GOALIE_CHANGED',team:'home',player:'9',reason:'Skater substitutes in goal'});
 await event({type:'SHOT_RECORDED',team:'away'});
 await event({type:'GAME_ENDED'});
 const submitted=await op('/api/scoresheet/v1/submit',{});
 assert.equal(submitted.status,201,JSON.stringify(submitted.body));
 assert.equal(submitted.body.document.score.home,1);
 assert.equal(submitted.body.document.score.away,0);
 assert.equal(submitted.body.document.penalties.length,1);
 const signature=await post('/api/scoresheet/v1/sign',{revision:submitted.body.revision,digest:submitted.body.digest,
  decision:'APPROVE',attestation:'I have reviewed this exact scoresheet and intend to sign it'},hdr);
 assert.equal(signature.status,200,JSON.stringify(signature.body));
 const published=await op('/api/scoresheet/v1/deliver',{});
 assert.equal(published.status,200,JSON.stringify(published.body));
 assert.equal(published.body.blocked,0,JSON.stringify(published.body));
 const gameRow=league.db.prepare('SELECT status,home_score home,away_score away,certified_by certifiedBy FROM games WHERE id=?').get(game.id);
 assert.deepEqual([gameRow.status,gameRow.home,gameRow.away],['final',1,0]);
 assert.match(gameRow.certifiedBy,/^scoresheet:/);
 const goal=league.db.prepare('SELECT scorer_id scorer,assist1_id assist FROM goal_attributions WHERE game_id=?').get(game.id);
 assert.deepEqual([goal.scorer,goal.assist],['f22','f9']);
 const goalies=league.db.prepare('SELECT player_id playerId,shots_against shots,saves,goals_against ga FROM certified_goalie_stats WHERE game_id=? ORDER BY player_id').all(game.id);
 assert.deepEqual(goalies.map(x=>x.playerId),['f31','f9','m21','m29']);
 assert.ok(goalies.every(g=>g.shots===g.saves+g.ga));
 assert.equal(goalies.reduce((n,g)=>n+g.ga,0),1);
 const again=await op('/api/scoresheet/v1/deliver',{});
 assert.equal(again.body.delivered,0);
 const before=app.authority.rows().length;
 await app.stop();app=null;
 const reopened=new LeagueStore(file);
 try{
  assert.equal(reopened.db.prepare('SELECT status FROM games WHERE id=?').get(game.id).status,'final');
  assert.equal(reopened.db.prepare('SELECT count(*) n FROM game_events WHERE game_id=?').get('demo').n,before);
  assert.equal(reopened.db.prepare('SELECT count(*) n FROM goal_attributions WHERE game_id=?').get(game.id).n,1);
  assert.equal(reopened.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{reopened.close();}
});
