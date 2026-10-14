#!/usr/bin/env node
'use strict';
// M2: schedule-only, fictional-only export. NEVER export results, scores,
// events, rosters, DOBs or other personal information.
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const STATES=Object.freeze({scheduled:'Scheduled',live:'Live',final:'Final'});
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
function exportSchedule(db){
 const leagues=db.prepare('SELECT id,timezone FROM leagues ORDER BY id').all();
 if(leagues.length!==1||leagues[0].id!=='demo-league')
  throw Error('Only a single fictional demo-league may be exported');
 const games=db.prepare('SELECT id,division_id,date,venue,sheet,home_team_id,away_team_id,status FROM games ORDER BY date,id').all();
 if(games.length>500)throw Error('M2 demo schedule exceeds 500 games');
 const result=games.map(g=>{
  if(!ISO.test(g.date)||!Number.isFinite(Date.parse(g.date))||!STATES[g.status])
   throw Error('Unsupported source schedule time or game state');
  const utc=new Date(g.date).toISOString().replace('.000Z','Z');
  return {
   icebreaker_id:g.id,division:g.division_id,home_team:g.home_team_id,away_team:g.away_team_id,
   scheduled_source_iso:g.date,scheduled_utc:utc,
   scheduled_at:utc.replace('T',' ').replace('Z',''),
   venue:g.venue,rink:g.sheet,source_game_state:STATES[g.status],
   // This describes the scheduling status, NOT whether a game was certified.
   schedule_status:'Scheduled'
  };
 });
 return {schema_version:2,fictional:true,games:result};
}
function main(argv=process.argv.slice(2)){
 if(argv.length!==2||argv[0]!=='--db')throw Error('Usage: node export-frappe-schedule.js --db /path/to/fictional-demo.db');
 if(!fs.existsSync(argv[1]))throw Error('Database does not exist');
 const db=new DatabaseSync(argv[1],{readOnly:true});
 try{process.stdout.write(JSON.stringify(exportSchedule(db),null,2)+'\n');}
 finally{db.close();}
}
if(require.main===module){try{main();}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}}
module.exports={exportSchedule,main};
