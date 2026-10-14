'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {LeagueStore}=require('../../server/league-store');
const {exportSnapshot}=require('../../tools/export-frappe-admin');
const root=path.resolve(__dirname,'../../../frappe/icebreaker_league/icebreaker_league/icebreaker_league/doctype');
const kinds=['league','season','division','club','team','game'];
test('Frappe v16 app has stable-ID DocTypes and restricted initial permissions',()=>{
 for(const kind of kinds){
  const name='IceBreaker '+kind[0].toUpperCase()+kind.slice(1);
  const file=path.join(root,'icebreaker_'+kind,'icebreaker_'+kind+'.json');
  const doc=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(doc.name,name);
  assert.equal(doc.autoname,'field:icebreaker_id');
  assert.equal(doc.fields.find(f=>f.fieldname==='icebreaker_id').unique,1);
  assert.deepEqual(doc.permissions.map(p=>p.role),['System Manager']);
  assert.ok(fs.existsSync(path.join(root,'icebreaker_'+kind,'icebreaker_'+kind+'.py')));
 }
});
test('Frappe demo export excludes private players, guardian records and game events',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-frappe-'));
 const league=new LeagueStore(path.join(dir,'demo.db'),{seedDemo:true});
 t.after(()=>{league.close();fs.rmSync(dir,{recursive:true,force:true});});
 const snapshot=exportSnapshot(league.db);
 assert.equal(snapshot.schema_version,1);
 assert.equal(snapshot.fictional,true);
 assert.equal(snapshot.leagues[0].icebreaker_id,'demo-league');
 assert.ok(snapshot.teams.length>0);
 assert.ok(snapshot.divisions.length>0);
 for(const key of ['players','player_private_profiles','roster_memberships','goals','game_events','certified_goalie_stats']){
  assert.equal(Object.hasOwn(snapshot,key),false);
 }
 assert.ok(!JSON.stringify(snapshot).includes('birth_date'));
});
test('Frappe export refuses non-demo leagues rather than labeling real records fictional',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-frappe-reject-'));
 const league=new LeagueStore(path.join(dir,'demo.db'),{seedDemo:true});
 t.after(()=>{league.close();fs.rmSync(dir,{recursive:true,force:true});});
 league.db.prepare('INSERT INTO leagues(id,name) VALUES(?,?)').run('real-league','Not fictional');
 assert.throws(()=>exportSnapshot(league.db),/Only the fictional/);
});
