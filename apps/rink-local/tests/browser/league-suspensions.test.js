'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LeagueStore}=require('../../server/league-store');
const {TeamAccounts}=require('../../server/team-accounts');
const {snapshotForGame}=require('../../server/game-roster-policy');
const {pregameSnapshot}=require('../../server/pregame-gate');
const {gameDate}=require('../../server/player-suspensions');
function setup(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-suspension-'));const file=path.join(dir,'game.sqlite');const league=new LeagueStore(file,{seedDemo:true}),accounts=new TeamAccounts(file);const game=league.db.prepare("SELECT * FROM games WHERE status='scheduled' ORDER BY date LIMIT 1").get();return {dir,file,league,accounts,game,close(){accounts.close();league.close();fs.rmSync(dir,{recursive:true,force:true});}};}
test('inclusive league-local dates block lineup selection, but allow dates outside window',t=>{
 const x=setup();t.after(()=>x.close());const {game,accounts,league}=x;
 const date=gameDate(league.db,game.id),team=game.home_team_id,player=accounts.roster(team)[0];
 assert.match(date,/^\d{4}-\d{2}-\d{2}$/);
 const s=league.addSuspension({leagueId:'demo-league',playerId:player.id,startDate:date,endDate:date,reason:'League discipline',actor:'league-admin'});
 assert.equal(league.suspensions({playerId:player.id}).length,1);
 assert.throws(()=>accounts.confirmLineup(team,game.id,'manager',{playerIds:[player.id],expectedRosterRevision:0}),/Suspended player/);
 const lineup=accounts.getLineup(team,game.id);const row=lineup.players.find(p=>p.id===player.id);
 assert.equal(row.eligible,false);assert.equal(row.suspension.startDate,date);
 const other=accounts.roster(team).find(p=>p.id!==player.id);
 assert.doesNotThrow(()=>accounts.confirmLineup(team,game.id,'manager',{playerIds:[other.id],expectedRosterRevision:0}));
 league.revokeSuspension(s.id,{actor:'league-admin',reason:'Appeal granted'});
 assert.equal(league.suspensions().length,0);
 assert.equal(league.suspensions({includeRevoked:true}).length,1);
 assert.doesNotThrow(()=>accounts.confirmLineup(team,game.id,'manager',{playerIds:[player.id],expectedRosterRevision:0}));
 assert.throws(()=>league.revokeSuspension(s.id,{reason:'again'}),/already revoked/);
});
test('a new suspension invalidates previously confirmed lineup and pregame readiness',t=>{
 const x=setup();t.after(()=>x.close());const {game,accounts,league}=x;
 const home=accounts.roster(game.home_team_id)[0],away=accounts.roster(game.away_team_id)[0];
 accounts.confirmLineup(game.home_team_id,game.id,'manager',{playerIds:[home.id],expectedRosterRevision:0});
 accounts.confirmLineup(game.away_team_id,game.id,'manager',{playerIds:[away.id],expectedRosterRevision:0});
 assert.equal(snapshotForGame(accounts.db,game.id).confirmed,true);
 const date=gameDate(league.db,game.id);
 league.addSuspension({leagueId:'demo-league',playerId:home.id,startDate:date,endDate:date,reason:'Suspension'});
 assert.equal(snapshotForGame(accounts.db,game.id).confirmed,false);
 assert.equal(pregameSnapshot(accounts.db,game.id).ready,false);
 assert.equal(accounts.getLineup(game.home_team_id,game.id).confirmed.playerIds.includes(home.id),true);
});
test('invalid dates and unknown players never mutate suspension ledger',t=>{
 const x=setup();t.after(()=>x.close());const p=x.accounts.roster(x.game.home_team_id)[0];
 for(const [startDate,endDate] of [['2026-02-30','2026-03-01'],['2026-11-02','2026-11-01'],['2026/11/01','2026-11-02']])assert.throws(()=>x.league.addSuspension({leagueId:'demo-league',playerId:p.id,startDate,endDate,reason:'Test'}),/Invalid/);
 assert.throws(()=>x.league.addSuspension({leagueId:'demo-league',playerId:'nonexistent',startDate:'2026-11-01',endDate:'2026-11-02',reason:'Test'}),/Unknown player/);
 assert.equal(x.league.suspensions().length,0);
});
test('team schedule only includes own league games and is chronologically ordered',t=>{
 const x=setup();t.after(()=>x.close());const team=x.game.home_team_id,rows=x.accounts.schedule(team);
 assert.ok(rows.length);assert.ok(rows.every(g=>g.homeTeamId===team||g.awayTeamId===team));
 assert.deepEqual(rows.map(g=>g.date),[...rows.map(g=>g.date)].sort());
});
