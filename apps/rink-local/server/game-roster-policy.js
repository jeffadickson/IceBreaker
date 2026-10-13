'use strict';
const {activeForGame,gameDate}=require('./player-suspensions');
const {gamePlayerTraining}=require('./participant-compliance');
// Game-bound roster gate for the local rink authority. Uses the persistent
// team confirmation snapshot, not the mutable season roster, to validate play.
const ATTR_FIELDS = {
  GOAL_RECORDED: ['scorer','assist1','assist2'],
  PENALTY_ASSESSED: ['player'],
  GOALIE_CHANGED: ['player']
};
function snapshotForGame(db,gameId){
  const game=db.prepare('SELECT id,home_team_id,away_team_id FROM games WHERE id=?').get(gameId);
  if(!game)throw Error('Rink game is not linked to a scheduled league game');
  const sides={home:game.home_team_id,away:game.away_team_id};
  const result={gameId,teams:{},confirmed:false};
  for(const [side,teamId] of Object.entries(sides)){
    const row=db.prepare('SELECT * FROM game_roster_confirmations WHERE game_id=? AND team_id=?').get(gameId,teamId);
    const selection=row?JSON.parse(row.player_ids_json):[];
    const ids=new Set(selection);
    const members=db.prepare('SELECT r.player_id id,r.jersey jersey,p.display_name name,r.position position FROM roster_memberships r JOIN teams t ON t.id=r.team_id JOIN divisions d ON d.id=t.division_id AND d.season_id=r.season_id JOIN players p ON p.id=r.player_id WHERE r.team_id=? ORDER BY r.jersey').all(teamId);
    const eligible=members.filter(p=>ids.has(p.id));
    const suspensions=activeForGame(db,gameId,eligible.map(p=>p.id));
    const hasTraining=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='season_training_requirements'").get();const day=hasTraining?gameDate(db,gameId):null;const trainingMissing=day?eligible.flatMap(p=>gamePlayerTraining(db,p.id,teamId,gameId,day).filter(x=>x.blocksLineup&&!x.complete).map(x=>({playerId:p.id,code:x.code}))):[];
    result.teams[side]={teamId,confirmed:!!row,eligible:suspensions.length===0&&trainingMissing.length===0,trainingMissing,suspensions:suspensions.map(({playerId,startDate,endDate})=>({playerId,startDate,endDate})),revision:row?.roster_revision??null,confirmedAt:row?.confirmed_at??null,players:eligible};
  }
  result.confirmed=result.teams.home.confirmed&&result.teams.away.confirmed&&result.teams.home.eligible&&result.teams.away.eligible;
  return result;
}
function assertGameRosterEligible(snapshot,command,lookupGoalTeam){
  if(!snapshot?.confirmed)throw Error('Both teams must confirm eligible, non-suspended game-day rosters before player events');
  const fields=ATTR_FIELDS[command?.type];
  if(!fields&&command?.type!=='GOAL_ATTRIBUTION_CORRECTED')return;
  const team=command.type==='GOAL_ATTRIBUTION_CORRECTED'?lookupGoalTeam?.(command.originalEventId):command.team;
  if(!['home','away'].includes(team))throw Error('Cannot determine scoring team for lineup validation');
  const permitted=snapshot.teams[team].players;
  const jerseyCounts=new Map();
  for(const player of permitted){const jersey=String(player.jersey);jerseyCounts.set(jersey,(jerseyCounts.get(jersey)||0)+1);}
  for(const field of fields||['scorer','assist1','assist2']){
    const value=String(command[field]);
    if(value==='TBD'||value==='None'||(command.type==='GOALIE_CHANGED'&&command.player===null))continue;
    const count=jerseyCounts.get(String(Number(value)))||0;
    if(count===0)throw Error(`Jersey #${value} is not on the confirmed ${team} game roster`);
    if(count>1)throw Error(`Jersey #${value} is ambiguous on the confirmed ${team} game roster`);
  }
}
module.exports={snapshotForGame,assertGameRosterEligible};
