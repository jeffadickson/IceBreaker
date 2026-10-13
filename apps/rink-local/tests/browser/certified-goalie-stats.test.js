'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LeagueStore}=require('../../server/league-store');
test('certified goalie statistics are atomic, roster-checked, and season aggregated',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-goalie-certified-'));
 const store=new LeagueStore(path.join(dir,'league.db'),{seedDemo:true});
 t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 const game='g07',base={homeScore:0,awayScore:0,goals:[],expectedVersion:0};
 assert.throws(()=>store.certifyGame(game,{...base,goalieStats:[{side:'home',playerId:'m29',shotsAgainst:4,saves:5,goalsAgainst:0}]}),/Invalid certified goalie statistics/);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM certified_goalie_stats').get().n,0);
 assert.throws(()=>store.certifyGame(game,{...base,goalieStats:[{side:'home',playerId:'f31',shotsAgainst:5,saves:5,goalsAgainst:0}]}),/ineligible/);
 assert.equal(store.db.prepare('SELECT status FROM games WHERE id=?').get(game).status,'live');
 store.certifyGame(game,{...base,goalieStats:[
  {side:'home',playerId:'m29',shotsAgainst:5,saves:5,goalsAgainst:0},
  {side:'away',playerId:'f31',shotsAgainst:7,saves:7,goalsAgainst:0}
 ]});
 const stats=store.snapshot().goalieStats;
 const home=stats.find(x=>x.playerId==='m29');
 assert.equal(home.gamesInGoal,1);assert.equal(home.shotsAgainst,5);assert.equal(home.saves,5);assert.equal(home.savePercentage,1);
 assert.equal(stats.find(x=>x.playerId==='f31').shotsAgainst,7);
 assert.throws(()=>store.certifyGame(game,{...base,goalieStats:[]}),/immutable/);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM certified_goalie_stats WHERE game_id=?').get(game).n,2);
});
