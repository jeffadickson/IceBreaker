#!/usr/bin/env node
'use strict';
// Export *fictional* league administration metadata, never youth PII.
// M1: games and results are deliberately excluded pending timezone parity.
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
function exportSnapshot(db){
 const leagues=db.prepare('SELECT id icebreaker_id,name league_title,timezone,public_scoreboard_enabled flag FROM leagues ORDER BY id').all();
 if(!leagues.length||leagues.some(l=>l.icebreaker_id!=='demo-league'))
  throw Error('Only the fictional demo-league may be exported during M1');
 const seasons=db.prepare('SELECT s.id icebreaker_id,s.name season_title,ls.league_id league,s.start_date,s.end_date FROM seasons s JOIN league_seasons ls ON ls.season_id=s.id ORDER BY s.id').all();
 const divisions=db.prepare('SELECT id icebreaker_id,name division_title,season_id season,rules_version FROM divisions ORDER BY id').all();
 const clubs=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='registration_clubs'").get()?
  db.prepare("SELECT id icebreaker_id,name club_title,league_id league FROM registration_clubs ORDER BY id").all():[];
 const teamClub=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='registration_club_teams'").get()?
  db.prepare("SELECT team_id teamId,club_id clubId FROM registration_club_teams ORDER BY team_id").all():[];
 const mapping=new Map();
 for(const r of teamClub){
  if(mapping.has(r.teamId))throw Error('Team belongs to multiple clubs; reconcile before migration');
  mapping.set(r.teamId,r.clubId);
 }
 const teams=db.prepare('SELECT id icebreaker_id,name team_title,division_id division,short short_name FROM teams ORDER BY id').all()
  .map(t=>({...t,club:mapping.get(t.icebreaker_id)||null}));
 return {schema_version:1,fictional:true,
  leagues:leagues.map(({flag,...l})=>({...l,public_scoreboard_enabled:!!flag})),
  seasons,divisions,clubs,teams};
}
function main(args=process.argv.slice(2)){
 if(args.length!==2||args[0]!=='--db')throw Error('Usage: node export-frappe-admin.js --db /path/to/demo.db');
 const file=args[1];
 if(!fs.existsSync(file))throw Error('Database does not exist');
 const db=new DatabaseSync(file,{readOnly:true});
 try{process.stdout.write(JSON.stringify(exportSnapshot(db),null,2)+'\n');}
 finally{db.close();}
}
if(require.main===module){try{main();}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}}
module.exports={exportSnapshot,main};
