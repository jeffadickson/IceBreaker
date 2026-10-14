'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LeagueStore}=require('../../server/league-store');
const {exportSchedule}=require('../../tools/export-frappe-schedule');
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-frappe-m2-'));
 const league=new LeagueStore(path.join(dir,'demo.db'),{seedDemo:true});
 t.after(()=>{league.close();fs.rmSync(dir,{recursive:true,force:true});});
 return league.db;
}
test('M2 exports fictional games preserving timezone and without certified scores or PII',t=>{
 const db=setup(t),snapshot=exportSchedule(db);
 assert.equal(snapshot.schema_version,2);
 assert.equal(snapshot.fictional,true);
 assert.ok(snapshot.games.length>0);
 const game=snapshot.games.find(x=>x.icebreaker_id==='g01');
 assert.equal(game.scheduled_source_iso,'2026-10-03T11:00:00-07:00');
 assert.equal(game.scheduled_utc,'2026-10-03T18:00:00Z');
 assert.equal(game.scheduled_at,'2026-10-03 18:00:00');
 assert.equal(game.source_game_state,'Final');
 assert.equal(game.schedule_status,'Scheduled');
 const output=JSON.stringify(snapshot);
 for(const forbidden of ['home_score','away_score','scorer_id','goal_attributions','player_private_profiles','birth_date','certified_by','roster_memberships','event_journal']){
  assert.equal(output.includes(forbidden),false,forbidden);
 }
});
test('M2 export rejects non-demo league and unparseable source time',t=>{
 const db=setup(t);
 db.prepare("UPDATE games SET date=? WHERE id='g01'").run('2026-10-03 11:00');
 assert.throws(()=>exportSchedule(db),/Unsupported source schedule/);
 db.prepare("UPDATE games SET date=? WHERE id='g01'").run('2026-10-03T11:00:00-07:00');
 db.prepare("INSERT INTO leagues(id,name) VALUES('real-league','Real League')").run();
 assert.throws(()=>exportSchedule(db),/single fictional demo-league/);
});
test('Frappe Game DocType contains original offset and UTC projection without score fields',()=>{
 const file=path.resolve(__dirname,'../../../frappe/icebreaker_league/icebreaker_league/icebreaker_league/doctype/icebreaker_game/icebreaker_game.json');
 const doc=JSON.parse(fs.readFileSync(file,'utf8'));
 const fields=new Set(doc.fields.map(x=>x.fieldname));
 for(const f of ['scheduled_source_iso','scheduled_utc','scheduled_at','source_game_state','schedule_status'])assert.ok(fields.has(f));
 for(const f of ['home_score','away_score','goals','penalties','certified_at'])assert.ok(!fields.has(f));
});
