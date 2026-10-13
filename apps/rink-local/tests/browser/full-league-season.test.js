'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LeagueStore}=require('../../server/league-store');
const {TeamAccounts}=require('../../server/team-accounts');
const {pregameSnapshot}=require('../../server/pregame-gate');
const {gameDate}=require('../../server/player-suspensions');
const training=require('../../server/training-catalog');
const DIV='sim-10u',T=8,P=15;
const team=i=>'sim-team-'+i,player=(i,j)=>'sim-player-'+i+'-'+j;
function seed(l){
 const db=l.db,addTeam=db.prepare('INSERT INTO teams VALUES(?,?,?,?,?,?)');
 db.prepare('INSERT INTO divisions VALUES(?,?,?,?)').run(DIV,'demo-2026','Synthetic 10U League','SIM-2-1-0');
 for(let i=0;i<T;i++){
  addTeam.run(team(i),DIV,'Synthetic '+i,'S'+i,'Fictional City','blue');
  for(let j=0;j<P;j++){
   db.prepare("INSERT INTO players(id,display_name,privacy_status) VALUES(?,?,'PUBLIC_ALIAS')").run(player(i,j),'Fictional '+i+'-'+j);
   db.prepare('INSERT INTO roster_memberships VALUES(?,?,?,?,?)').run('demo-2026',team(i),player(i,j),j+1,j<2?'G':'F');
  }
 }
 const games=[];
 for(let leg=0;leg<2;leg++)for(let i=0;i<T;i++)for(let j=i+1;j<T;j++){
  const n=games.length,home=leg?j:i,away=leg?i:j;
  const id='sim-game-'+n,date=new Date(Date.UTC(2026,9,14+n,17)).toISOString();
  l.createGame({id,divisionId:DIV,date,home:team(home),away:team(away),venue:'Fictional Rink',sheet:'A'});
  games.push({id,home,away,date});
 }
 return games;
}
function certify(l,g){
 l.certifyGame(g.id,{homeScore:1,awayScore:0,expectedVersion:0,actor:'synthetic-certified-import',
  goals:[{side:'home',scorerId:player(g.home,2),assist1Id:player(g.home,3)}],
  goalieStats:[
   {side:'home',playerId:player(g.home,0),shotsAgainst:2,saves:2,goalsAgainst:0},
   {side:'home',playerId:player(g.home,1),shotsAgainst:2,saves:2,goalsAgainst:0},
   {side:'away',playerId:player(g.away,0),shotsAgainst:3,saves:2,goalsAgainst:1},
   {side:'away',playerId:player(g.away,1),shotsAgainst:4,saves:4,goalsAgainst:0}
  ]});
}
test('SIM-001: 8 teams / 120 players / 56 certified games, standings, assists and split goalie stats',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-season-')),file=path.join(dir,'season.db');
 const l=new LeagueStore(file,{seedDemo:true});
 t.after(()=>{l.close();fs.rmSync(dir,{recursive:true,force:true});});
 const games=seed(l);
 assert.equal(games.length,56);
 assert.equal(l.snapshotDivision(DIV).teams.length,8);
 assert.equal(l.snapshotDivision(DIV).players.length,120);
 assert.equal(l.snapshotDivision(DIV).schedule.length,56);
 assert.throws(()=>l.certifyGame(games[0].id,{homeScore:2,awayScore:0,expectedVersion:0,goals:[{side:'home',scorerId:player(0,2)}]}),/reconcile/);
 assert.equal(l.db.prepare('SELECT count(*) n FROM goal_attributions WHERE game_id=?').get(games[0].id).n,0);
 for(const g of games)certify(l,g);
 const view=l.snapshotDivision(DIV);
 assert.ok(view.schedule.every(g=>g.status==='final'&&g.certification==='CERTIFIED'));
 for(const r of view.standings)assert.deepEqual([r.played,r.wins,r.losses,r.points,r.gf,r.ga],[14,7,7,14,7,7]);
 assert.ok(view.players.every(p=>p.gp===14));
 for(let i=0;i<8;i++){
  assert.equal(view.players.find(p=>p.id===player(i,2)).g,7);
  assert.equal(view.players.find(p=>p.id===player(i,3)).a,7);
  for(let j=0;j<2;j++){
   const g=view.goalieStats.find(p=>p.playerId===player(i,j));
   assert.equal(g.gamesInGoal,14);
   assert.equal(g.shotsAgainst,j?42:35);
   assert.equal(g.goalsAgainst,j?0:7);
   assert.equal(g.shotsAgainst,g.saves+g.goalsAgainst);
  }
 }
 assert.equal(view.standings.reduce((n,r)=>n+r.gf,0),56);
 assert.equal(view.standings.reduce((n,r)=>n+r.ga,0),56);
 assert.equal(l.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(l.db.prepare('PRAGMA foreign_key_check').all().length,0);
 const again=new LeagueStore(file);
 try{
  assert.deepEqual(again.snapshotDivision(DIV).standings,view.standings);
  assert.deepEqual(again.snapshotDivision(DIV).players,view.players);
  assert.deepEqual(again.snapshotDivision(DIV).goalieStats,view.goalieStats);
  assert.equal(again.snapshot().teams.length,4);
  assert.throws(()=>again.certifyGame(games[0].id,{homeScore:0,awayScore:0,goals:[],expectedVersion:1}),/immutable/);
 }finally{again.close();}
});
test('SIM-002: late suspension and expired training invalidate confirmed game-day lineups',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-eligibility-')),file=path.join(dir,'league.db');
 const l=new LeagueStore(file,{seedDemo:true}),teams=new TeamAccounts(file);
 t.after(()=>{teams.close();l.close();fs.rmSync(dir,{recursive:true,force:true});});
 const g=seed(l)[0],home=team(g.home),away=team(g.away),day=gameDate(l.db,g.id);
 const p=player(g.home,2),q=player(g.home,3),r=player(g.away,2);
 const suspension=l.addSuspension({leagueId:'demo-league',playerId:p,startDate:day,endDate:day,reason:'Synthetic discipline'});
 assert.throws(()=>teams.confirmLineup(home,g.id,'manager',{playerIds:[p],expectedRosterRevision:0}),/Suspended/);
 l.revokeSuspension(suspension.id,{reason:'Appeal accepted'});
 const c=training.createTraining(l.db,{code:'SIM_ANTI_BULLYING',title:'Fictional anti-bullying'},'admin');
 training.addPolicy(l.db,{trainingId:c.trainingId,scopeType:'LEAGUE',scopeId:'demo-league',seasonId:'demo-2026',role:'PLAYER',renewalMode:'ANNUAL_SEASON',effectiveFrom:'2026-09-01'},'admin');
 assert.throws(()=>teams.confirmLineup(home,g.id,'manager',{playerIds:[q],expectedRosterRevision:0}),/training incomplete/);
 for(const id of [p,q,r])training.recordCompletion(l.db,{trainingId:c.trainingId,subjectType:'PLAYER',subjectId:id,completedOn:'2026-09-20'},'admin');
 teams.confirmLineup(home,g.id,'manager',{playerIds:[p,q],expectedRosterRevision:0});
 teams.confirmLineup(away,g.id,'manager',{playerIds:[r],expectedRosterRevision:0});
 assert.equal(pregameSnapshot(teams.db,g.id).ready,true);
 const late=l.addSuspension({leagueId:'demo-league',playerId:p,startDate:day,endDate:day,reason:'Late ruling'});
 assert.equal(pregameSnapshot(teams.db,g.id).ready,false);
 l.revokeSuspension(late.id,{reason:'Corrected ruling'});
 assert.equal(pregameSnapshot(teams.db,g.id).ready,true);
});
module.exports={seed,team,player,DIV};
