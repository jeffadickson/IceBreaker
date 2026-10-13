'use strict';
// Development league persistence. The same database can hold multiple seasons.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const demo=require('./league-data');
const {initSuspensions,validDate}=require('./player-suspensions');
class LeagueStore {
 constructor(file,{seedDemo=false}={}){
  fs.mkdirSync(path.dirname(file),{recursive:true});this.db=new DatabaseSync(file);
  this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
   CREATE TABLE IF NOT EXISTS seasons(id TEXT PRIMARY KEY,name TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS leagues(id TEXT PRIMARY KEY,name TEXT NOT NULL,public_scoreboard_enabled INTEGER NOT NULL DEFAULT 1 CHECK(public_scoreboard_enabled IN (0,1)),timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles');
   CREATE TABLE IF NOT EXISTS league_seasons(league_id TEXT NOT NULL REFERENCES leagues(id),season_id TEXT NOT NULL REFERENCES seasons(id),PRIMARY KEY(league_id,season_id),UNIQUE(season_id));
   CREATE TABLE IF NOT EXISTS divisions(id TEXT PRIMARY KEY,season_id TEXT NOT NULL REFERENCES seasons(id),name TEXT NOT NULL,rules_version TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS division_timing_rules(division_id TEXT NOT NULL REFERENCES divisions(id),version TEXT NOT NULL,rules_json TEXT NOT NULL,PRIMARY KEY(division_id,version));
   CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY,division_id TEXT NOT NULL REFERENCES divisions(id),name TEXT NOT NULL,short TEXT NOT NULL,city TEXT NOT NULL,tone TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,display_name TEXT NOT NULL,privacy_status TEXT NOT NULL DEFAULT 'PUBLIC_ALIAS');
   CREATE TABLE IF NOT EXISTS roster_memberships(season_id TEXT NOT NULL REFERENCES seasons(id),team_id TEXT NOT NULL REFERENCES teams(id),player_id TEXT NOT NULL REFERENCES players(id),jersey INTEGER NOT NULL,position TEXT NOT NULL,PRIMARY KEY(season_id,team_id,player_id));
   CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,division_id TEXT NOT NULL REFERENCES divisions(id),date TEXT NOT NULL,venue TEXT NOT NULL,sheet TEXT NOT NULL,home_team_id TEXT NOT NULL REFERENCES teams(id),away_team_id TEXT NOT NULL REFERENCES teams(id),status TEXT NOT NULL CHECK(status IN ('scheduled','live','final')),home_score INTEGER,away_score INTEGER,certified_at TEXT,certified_by TEXT,version INTEGER NOT NULL DEFAULT 0,CHECK(home_team_id<>away_team_id));
   CREATE TABLE IF NOT EXISTS goal_attributions(id TEXT PRIMARY KEY,game_id TEXT NOT NULL REFERENCES games(id),team_id TEXT NOT NULL REFERENCES teams(id),scorer_id TEXT REFERENCES players(id),assist1_id TEXT REFERENCES players(id),assist2_id TEXT REFERENCES players(id),CHECK(scorer_id IS NULL OR scorer_id<>assist1_id),CHECK(scorer_id IS NULL OR scorer_id<>assist2_id),CHECK(assist1_id IS NULL OR assist2_id IS NULL OR assist1_id<>assist2_id));
   CREATE TABLE IF NOT EXISTS certified_goalie_stats(game_id TEXT NOT NULL REFERENCES games(id),team_id TEXT NOT NULL REFERENCES teams(id),player_id TEXT NOT NULL REFERENCES players(id),shots_against INTEGER NOT NULL CHECK(shots_against>=0),saves INTEGER NOT NULL CHECK(saves>=0),goals_against INTEGER NOT NULL CHECK(goals_against>=0),PRIMARY KEY(game_id,team_id,player_id),CHECK(shots_against=saves+goals_against));
   CREATE TABLE IF NOT EXISTS league_audit(id TEXT PRIMARY KEY,at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,entity_id TEXT NOT NULL,payload_json TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS ix_games_division_date ON games(division_id,date);
   CREATE INDEX IF NOT EXISTS ix_goals_game ON goal_attributions(game_id);
  `);
  initSuspensions(this.db);
  if(seedDemo&&this.db.prepare('SELECT count(*) n FROM seasons').get().n===0)this.seedDemo();
  // Backward-compatible mapping for existing single-league prototype databases.
  this.db.prepare("INSERT OR IGNORE INTO leagues(id,name,public_scoreboard_enabled,timezone) VALUES('demo-league','Demonstration League',1,'America/Los_Angeles')").run();
  this.db.prepare("INSERT OR IGNORE INTO league_seasons(league_id,season_id) SELECT 'demo-league',id FROM seasons WHERE id NOT IN (SELECT season_id FROM league_seasons)").run();
  // Existing divisions acquire a default versioned regulation timing policy.
  const {DEFAULT_TIMING}=require('./game-timing-rules');
  const addTiming=this.db.prepare('INSERT OR IGNORE INTO division_timing_rules(division_id,version,rules_json) VALUES(?,?,?)');
  for(const d of this.db.prepare('SELECT id,rules_version FROM divisions').all())addTiming.run(d.id,d.rules_version,JSON.stringify(DEFAULT_TIMING));
 }
 tx(action){this.db.exec('BEGIN IMMEDIATE');try{const value=action();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 audit(action,id,payload,actor='system'){this.db.prepare('INSERT INTO league_audit VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),new Date().toISOString(),actor,action,id,JSON.stringify(payload));}
 seedDemo(){this.tx(()=>{
  this.db.prepare('INSERT INTO seasons VALUES(?,?,?,?)').run('demo-2026','Demo 2026 Fall','2026-09-01','2026-12-31');
  this.db.prepare('INSERT INTO divisions VALUES(?,?,?,?)').run('demo-10u','demo-2026','10U demonstration','DEMO-2-1-0-v1');
  const team=this.db.prepare('INSERT INTO teams VALUES(?,?,?,?,?,?)');for(const t of demo.teams)team.run(t.id,'demo-10u',t.name,t.short,t.city,t.tone);
  const p=this.db.prepare('INSERT INTO players VALUES(?,?,?)'),r=this.db.prepare('INSERT INTO roster_memberships VALUES(?,?,?,?,?)');for(const x of demo.players){p.run(x.id,x.name,'PUBLIC_ALIAS');r.run('demo-2026',x.teamId,x.id,x.number,x.position);}
  const game=this.db.prepare('INSERT INTO games(id,division_id,date,venue,sheet,home_team_id,away_team_id,status,home_score,away_score,certified_at,certified_by,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');const goal=this.db.prepare('INSERT INTO goal_attributions VALUES(?,?,?,?,?,?)');
  for(const g of demo.fixtures){game.run(g.id,'demo-10u',g.date,g.venue,g.sheet,g.home,g.away,g.status,g.homeScore,g.awayScore,g.status==='final'?'2026-10-11T00:00:00Z':null,g.status==='final'?'DEMO_FIXTURE':null,0);for(const [index,x] of g.goals.entries()){const scorer=demo.players.find(p=>p.id===x[0]);goal.run(`${g.id}-goal-${index+1}`,g.id,scorer.teamId,x[0],x[1],null);}}
  this.audit('DEMO_DATA_SEEDED','demo-2026',{fictional:true});
 });}
 createGame(g,{actor='league-admin'}={}){if(!g||!/^[-\w]{2,64}$/.test(g.id))throw Error('Invalid game id');const teams=this.db.prepare('SELECT id,division_id FROM teams WHERE id IN (?,?)').all(g.home,g.away);if(teams.length!==2||g.home===g.away||teams.some(t=>t.division_id!==g.divisionId))throw Error('Teams must be distinct and in division');if(!Number.isFinite(Date.parse(g.date)))throw Error('Invalid date');return this.tx(()=>{this.db.prepare('INSERT INTO games(id,division_id,date,venue,sheet,home_team_id,away_team_id,status,version) VALUES(?,?,?,?,?,?,?,\'scheduled\',0)').run(g.id,g.divisionId,g.date,String(g.venue||'TBD').slice(0,100),String(g.sheet||'TBD').slice(0,60),g.home,g.away);this.audit('GAME_SCHEDULED',g.id,g,actor);return {id:g.id,status:'scheduled'};});}
 certifyGame(id,{homeScore,awayScore,goals,expectedVersion,goalieStats=null,actor='league-admin'}={}){
  if(!Number.isInteger(homeScore)||homeScore<0||!Number.isInteger(awayScore)||awayScore<0||!Number.isInteger(expectedVersion)||!Array.isArray(goals))throw Error('Invalid certification payload');
  return this.tx(()=>{
   const g=this.db.prepare('SELECT * FROM games WHERE id=?').get(id);if(!g)throw Error('Unknown game');if(g.status==='final')throw Error('Final result immutable; correction workflow required');if(g.version!==expectedVersion)throw Error('Version conflict');
   const roster=this.db.prepare('SELECT r.player_id,r.team_id FROM roster_memberships r JOIN divisions d ON d.season_id=r.season_id WHERE d.id=?').all(g.division_id);const membership=new Set(roster.map(p=>`${p.team_id}:${p.player_id}`));let h=0,a=0;
   for(const goal of goals){if(!['home','away'].includes(goal.side))throw Error('Invalid goal side');const teamId=goal.side==='home'?g.home_team_id:g.away_team_id;if(goal.side==='home')h++;else a++;
    const ids=[goal.scorerId,goal.assist1Id,goal.assist2Id].filter(v=>v!==null&&v!==undefined);
    if(new Set(ids).size!==ids.length)throw Error('Duplicate goal attribution');for(const p of ids)if(!membership.has(`${teamId}:${p}`))throw Error('Player not on scoring team roster');
    if(!goal.scorerId)throw Error('Certification requires resolved goal scorer');
   }
   if(h!==homeScore||a!==awayScore)throw Error('Certified goal events do not reconcile to score');
   if(goalieStats!==null){
    if(!Array.isArray(goalieStats))throw Error('Invalid certified goalie statistics');
    const seen=new Set(),bySide={home:{shots:0,goals:0},away:{shots:0,goals:0}};
    for(const row of goalieStats){
     if(!row||!['home','away'].includes(row.side)||typeof row.playerId!=='string'||![row.shotsAgainst,row.saves,row.goalsAgainst].every(x=>Number.isSafeInteger(x)&&x>=0)||row.shotsAgainst!==row.saves+row.goalsAgainst)throw Error('Invalid certified goalie statistics');
     const teamId=row.side==='home'?g.home_team_id:g.away_team_id,key=teamId+':'+row.playerId;
     if(!membership.has(key)||seen.has(key))throw Error('Duplicate or ineligible certified goalie');
     seen.add(key);bySide[row.side].shots+=row.shotsAgainst;bySide[row.side].goals+=row.goalsAgainst;
    }
    // Goals credited to a goalie can never exceed opposing goals; empty-net and
    // unattributed shots may account for the difference.
    if(bySide.home.goals>awayScore||bySide.away.goals>homeScore)throw Error('Goalie totals exceed opposing score');
   }
   this.db.prepare('DELETE FROM goal_attributions WHERE game_id=?').run(id);
   const insert=this.db.prepare('INSERT INTO goal_attributions VALUES(?,?,?,?,?,?)');for(const goal of goals){insert.run(crypto.randomUUID(),id,goal.side==='home'?g.home_team_id:g.away_team_id,goal.scorerId,goal.assist1Id||null,goal.assist2Id||null);}
   if(goalieStats!==null){const add=this.db.prepare('INSERT INTO certified_goalie_stats VALUES(?,?,?,?,?,?)');for(const row of goalieStats)add.run(id,row.side==='home'?g.home_team_id:g.away_team_id,row.playerId,row.shotsAgainst,row.saves,row.goalsAgainst);}
   const result=this.db.prepare("UPDATE games SET home_score=?,away_score=?,status='final',certified_at=?,certified_by=?,version=version+1 WHERE id=? AND version=?").run(homeScore,awayScore,new Date().toISOString(),actor,id,expectedVersion);
   if(result.changes!==1)throw Error('Version conflict');this.audit('RESULT_CERTIFIED',id,{homeScore,awayScore,goalCount:goals.length},actor);return {id,status:'final',version:expectedVersion+1};
  });
 }
 snapshot(authority){const teams=this.db.prepare('SELECT id,name,short,city,tone FROM teams ORDER BY id').all();const roster=this.db.prepare('SELECT r.team_id teamId,p.id,p.display_name name,r.jersey number,r.position FROM roster_memberships r JOIN players p ON p.id=r.player_id JOIN teams t ON t.id=r.team_id WHERE t.division_id=?').all('demo-10u');
  const games=this.db.prepare('SELECT * FROM games ORDER BY date,id').all();const goals=this.db.prepare('SELECT * FROM goal_attributions').all();const byGame=new Map();for(const p of goals){if(!byGame.has(p.game_id))byGame.set(p.game_id,[]);byGame.get(p.game_id).push([p.scorer_id,p.assist1_id,p.assist2_id]);}
  const fixtures=games.map(g=>({id:g.id,date:g.date,venue:g.venue,sheet:g.sheet,home:g.home_team_id,away:g.away_team_id,homeScore:g.home_score,awayScore:g.away_score,status:g.status,goals:byGame.get(g.id)||[],certification:g.certified_at?'CERTIFIED':'UNVERIFIED',version:g.version}));
  const rows=Object.fromEntries(teams.map(t=>[t.id,{teamId:t.id,played:0,wins:0,losses:0,ties:0,gf:0,ga:0,points:0}]));
  const stats=Object.fromEntries(roster.map(p=>[p.id,{...p,gp:0,g:0,a:0,pts:0}]));
  for(const g of fixtures){if(g.status!=='final'||g.certification!=='CERTIFIED')continue;const h=rows[g.home],a=rows[g.away];h.played++;a.played++;h.gf+=g.homeScore;h.ga+=g.awayScore;a.gf+=g.awayScore;a.ga+=g.homeScore;if(g.homeScore>g.awayScore){h.wins++;a.losses++;h.points+=2;}else if(g.homeScore<g.awayScore){a.wins++;h.losses++;a.points+=2;}else{h.ties++;a.ties++;h.points++;a.points++;}
   for(const p of roster)if(p.teamId===g.home||p.teamId===g.away)stats[p.id].gp++;
   for(const [scorer,assist1,assist2] of g.goals){if(stats[scorer])stats[scorer].g++;for(const id of [assist1,assist2])if(id&&stats[id])stats[id].a++;}
  }
  const goalieRows=this.db.prepare('SELECT s.*,g.division_id,g.status FROM certified_goalie_stats s JOIN games g ON g.id=s.game_id WHERE g.status=\'final\'').all();
  const goalieByPlayer=new Map();for(const r of goalieRows){const key=r.player_id;let v=goalieByPlayer.get(key);if(!v){v={playerId:key,teamId:r.team_id,gamesInGoal:0,shotsAgainst:0,saves:0,goalsAgainst:0};goalieByPlayer.set(key,v);}v.gamesInGoal++;v.shotsAgainst+=r.shots_against;v.saves+=r.saves;v.goalsAgainst+=r.goals_against;}
  const goalieStats=[...goalieByPlayer.values()].map(v=>({...v,savePercentage:v.shotsAgainst?Number((v.saves/v.shotsAgainst).toFixed(4)):null}));
  const live=authority?.spectator();const schedule=fixtures.map(g=>g.status==='live'&&live?{...g,homeScore:live.scores.home,awayScore:live.scores.away,period:live.period,seconds:live.seconds,updatedRevision:live.revision}:g);
  return {schemaVersion:2,source:'SQLITE_DEMONSTRATION_LEAGUE',message:'Fictional demonstration teams and players; not real league results.',season:{id:'demo-2026',name:'Demo 2026 Fall'},division:{id:'demo-10u',name:'10U demonstration'},standingsPolicy:{id:'DEMO-2-1-0-v1',win:2,tie:1,loss:0,tiebreakers:['points','wins','goal differential','team ID'],certifiedOnly:true},teams,goalieStats,players:Object.values(stats).map(p=>({...p,pts:p.g+p.a})).sort((a,b)=>b.pts-a.pts||b.g-a.g||a.id.localeCompare(b.id)),standings:Object.values(rows).map(x=>({...x,diff:x.gf-x.ga})).sort((a,b)=>b.points-a.points||b.wins-a.wins||b.gf-b.ga-(a.gf-a.ga)||a.teamId.localeCompare(b.teamId)),schedule,revision:live?.revision??0};
 }
 timingForDivision(divisionId){const row=this.db.prepare('SELECT d.rules_version AS version,r.rules_json AS rules FROM divisions d JOIN division_timing_rules r ON r.division_id=d.id AND r.version=d.rules_version WHERE d.id=?').get(divisionId);if(!row)throw Error('Division timing rules unavailable');const {validateTiming}=require('./game-timing-rules');return {divisionId,version:row.version,...validateTiming(JSON.parse(row.rules))};}
 configureDivisionTiming(divisionId,version,rules,{actor='league-admin'}={}){if(!/^[A-Za-z0-9_.-]{1,80}$/.test(version))throw Error('Invalid rules version');const {validateTiming}=require('./game-timing-rules');const checked=validateTiming(rules);return this.tx(()=>{const d=this.db.prepare('SELECT rules_version FROM divisions WHERE id=?').get(divisionId);if(!d)throw Error('Unknown division');const hasActive=this.db.prepare("SELECT 1 FROM games WHERE division_id=? AND status IN ('live','final') LIMIT 1").get(divisionId);if(hasActive)throw Error('Cannot change division timing policy after games have started; create a new division/ruleset revision through an authorized migration');this.db.prepare('INSERT INTO division_timing_rules VALUES(?,?,?)').run(divisionId,version,JSON.stringify(checked));this.db.prepare('UPDATE divisions SET rules_version=? WHERE id=?').run(version,divisionId);this.audit('DIVISION_TIMING_UPDATED',divisionId,{version,...checked},actor);return {divisionId,version,...checked};});}
 addSuspension({leagueId,playerId,startDate,endDate,reason,actor='league-admin'}={}){
  if(!validDate(startDate)||!validDate(endDate)||startDate>endDate||typeof reason!=='string'||!reason.trim()||reason.length>500)throw Error('Invalid suspension dates or reason');
  if(typeof playerId!=='string'||!this.db.prepare('SELECT 1 FROM players WHERE id=?').get(playerId))throw Error('Unknown player');
  if(typeof leagueId!=='string'||!this.db.prepare('SELECT 1 FROM leagues WHERE id=?').get(leagueId))throw Error('Unknown league');
  const membership=this.db.prepare('SELECT 1 FROM roster_memberships r JOIN teams t ON t.id=r.team_id JOIN divisions d ON d.id=t.division_id AND d.season_id=r.season_id JOIN league_seasons ls ON ls.season_id=d.season_id WHERE r.player_id=? AND ls.league_id=? LIMIT 1').get(playerId,leagueId);
  if(!membership)throw Error('Player is not registered in this league');
  const id=crypto.randomUUID(),at=new Date().toISOString();
  return this.tx(()=>{this.db.prepare('INSERT INTO player_suspensions(id,player_id,league_id,start_date,end_date,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,playerId,leagueId,startDate,endDate,reason.trim(),actor,at);this.audit('PLAYER_SUSPENDED',playerId,{id,leagueId,startDate,endDate,reason:reason.trim()},actor);return {id,leagueId,playerId,startDate,endDate,reason:reason.trim(),revoked:false};});
 }
 revokeSuspension(id,{actor='league-admin',reason}={}){
  if(typeof reason!=='string'||!reason.trim()||reason.length>500)throw Error('Revocation reason required');
  return this.tx(()=>{const row=this.db.prepare('SELECT * FROM player_suspensions WHERE id=?').get(id);if(!row)throw Error('Unknown suspension');if(row.revoked_at)throw Error('Suspension already revoked');const at=new Date().toISOString();this.db.prepare('UPDATE player_suspensions SET revoked_at=?,revoked_by=?,revocation_reason=? WHERE id=? AND revoked_at IS NULL').run(at,actor,reason.trim(),id);this.audit('PLAYER_SUSPENSION_REVOKED',row.player_id,{id,reason:reason.trim()},actor);return {id,revoked:true,revokedAt:at};});
 }
 suspensions({leagueId,playerId,includeRevoked=false}={}){const rows=this.db.prepare('SELECT id,league_id leagueId,player_id playerId,start_date startDate,end_date endDate,reason,created_by createdBy,created_at createdAt,revoked_at revokedAt,revoked_by revokedBy,revocation_reason revocationReason FROM player_suspensions ORDER BY start_date DESC,id').all();return rows.filter(r=>(!leagueId||r.leagueId===leagueId)&&(!playerId||r.playerId===playerId)&&(includeRevoked||!r.revokedAt));}
 close(){this.db.close();}
}
module.exports={LeagueStore};
