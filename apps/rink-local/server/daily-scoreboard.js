'use strict';
// Public read-only multi-division daily board. Dates are calendar days at the configured league timezone.
const assertDate=s=>{if(typeof s!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Invalid calendar date');return s;};
function dayAt(date,zone){const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));return obj.year+'-'+obj.month+'-'+obj.day;}
function dailyBoard(db,{date,seasonId,divisionId,timezone='America/Los_Angeles',liveGameId=null,liveSnapshot=null}={}){
 date=assertDate(date);if(typeof timezone!=='string'||timezone.length>100)throw Error('Invalid timezone');
 try{new Intl.DateTimeFormat('en-US',{timeZone:timezone});}catch{throw Error('Invalid timezone');}
 const seasons=db.prepare('SELECT id,name FROM seasons ORDER BY start_date DESC,id').all();
 const season=seasonId||seasons[0]?.id||null;
 if(season&&!seasons.some(s=>s.id===season))throw Error('Unknown season');
 const divisions=season?db.prepare('SELECT id,name,rules_version AS rulesVersion FROM divisions WHERE season_id=? ORDER BY name,id').all(season):[];
 if(divisionId&&!divisions.some(d=>d.id===divisionId))throw Error('Unknown division for season');
 const sql=`SELECT g.id,g.division_id AS divisionId,d.name AS divisionName,g.date AS startsAt,
 g.venue,g.sheet,g.status,g.home_score AS homeScore,g.away_score AS awayScore,g.certified_at AS certifiedAt,
 g.home_team_id AS homeTeamId,h.name AS homeName,h.short AS homeShort,
 g.away_team_id AS awayTeamId,a.name AS awayName,a.short AS awayShort
 FROM games g JOIN divisions d ON d.id=g.division_id JOIN teams h ON h.id=g.home_team_id
 JOIN teams a ON a.id=g.away_team_id WHERE d.season_id=? ORDER BY g.date,d.name,g.id`;
 const matches=season?db.prepare(sql).all(season):[];
 const games=matches.filter(g=>(!divisionId||g.divisionId===divisionId)&&dayAt(new Date(g.startsAt),timezone)===date).map(g=>{
  const live=g.id===liveGameId&&g.status==='live'&&liveSnapshot;
  return {...g,homeScore:live?liveSnapshot.scores.home:g.homeScore,awayScore:live?liveSnapshot.scores.away:g.awayScore,
   period:live?liveSnapshot.period:null,seconds:live?liveSnapshot.seconds:null,
   publication:g.certifiedAt?'CERTIFIED':g.status==='final'?'UNVERIFIED_FINAL':g.status==='live'?'PROVISIONAL':'SCHEDULED'};
 });
 return {schema:'icebreaker.daily-board.v1',date,timezone,seasonId:season,divisionId:divisionId||null,seasons,divisions,games,
  counts:{games:games.length,live:games.filter(x=>x.status==='live').length,final:games.filter(x=>x.status==='final').length}};
}
module.exports={dailyBoard,assertDate,dayAt};
