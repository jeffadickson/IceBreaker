'use strict';
// League-owned suspension windows. Dates are inclusive local calendar days,
// interpreted in the league timezone for the scheduled fixture.
function dateKey(value,zone='America/Los_Angeles'){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Invalid scheduled game date');
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=k=>parts.find(p=>p.type===k).value;
 return get('year')+'-'+get('month')+'-'+get('day');
}
function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;}
function initSuspensions(db){db.exec(`CREATE TABLE IF NOT EXISTS player_suspensions(
 id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),
 start_date TEXT NOT NULL,end_date TEXT NOT NULL,reason TEXT NOT NULL,
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,
 revoked_by TEXT,revoked_at TEXT,revocation_reason TEXT,
 CHECK(start_date<=end_date));
 CREATE INDEX IF NOT EXISTS ix_player_suspensions_dates ON player_suspensions(player_id,start_date,end_date);`);}
function gameDate(db,gameId){
 const row=db.prepare(`SELECT g.date,COALESCE(l.timezone,'America/Los_Angeles') timezone
 FROM games g JOIN divisions d ON d.id=g.division_id
 LEFT JOIN league_seasons ls ON ls.season_id=d.season_id
 LEFT JOIN leagues l ON l.id=ls.league_id WHERE g.id=?`).get(gameId);
 if(!row)throw Error('Unknown game');return dateKey(row.date,row.timezone);
}
function activeForGame(db,gameId,playerIds){
 if(!playerIds.length)return [];
 // Legacy isolated pregame fixtures may not initialize the league schema.
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='player_suspensions'").get())return [];
 const date=gameDate(db,gameId);
 const rows=db.prepare(`SELECT id,player_id playerId,start_date startDate,end_date endDate,reason
 FROM player_suspensions WHERE revoked_at IS NULL AND start_date<=? AND end_date>=?`).all(date,date);
 const ids=new Set(playerIds);
 return rows.filter(x=>ids.has(x.playerId));
}
module.exports={dateKey,validDate,initSuspensions,gameDate,activeForGame};
