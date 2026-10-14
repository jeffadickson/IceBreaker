'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'../../../frappe/icebreaker_league/icebreaker_league');
const read=p=>fs.readFileSync(path.join(app,p),'utf8');
test('M2 membership DocType cannot be managed by league admins or anonymous users',()=>{
 const d=JSON.parse(read('icebreaker_league/doctype/icebreaker_league_access/icebreaker_league_access.json'));
 assert.deepEqual(d.permissions.map(x=>x.role),['System Manager']);
 for(const f of ['user','league','enabled'])assert.ok(d.fields.some(x=>x.fieldname===f));
 const setup=read('setup.py');
 assert.match(setup,/IceBreaker League Admin/);
 assert.match(setup,/desk_access": 0/);
});
test('M2 schedule importer requires System Manager for mutations and scoped access for read',()=>{
 const src=read('schedule_importer.py');
 assert.match(src,/@frappe\.whitelist\(methods=\["POST"\]\)\s*def import_schedule_snapshot/);
 assert.match(src,/def import_schedule_snapshot\(league_id, payload\):\s*_require_admin\(\)/);
 assert.match(src,/def league_schedule\(league_id, limit=100\):[\s\S]*?require_league_reader\(league_id\)/);
 assert.match(src,/filters=\{"league": league_id\}/);
 assert.match(src,/filters=\{"division": \["in", divisions\]\}/);
 for(const field of ['birth_date','guardian_email','home_score','away_score','certified_by']){
  assert.ok(!src.includes('"'+field+'"'),'Unexpected private/result field '+field);
 }
});
test('Frappe schedule imports cannot change authoritative rink clock or certified result',()=>{
 const doc=JSON.parse(read('icebreaker_league/doctype/icebreaker_game/icebreaker_game.json'));
 assert.deepEqual(doc.permissions.map(x=>x.role),['System Manager']);
 assert.ok(!doc.fields.some(f=>/^(home_score|away_score|game_clock|goal_events|certified_at)$/.test(f.fieldname)));
 const src=read('schedule_importer.py');
 assert.match(src,/Conflicting existing schedule ID/);
 assert.match(src,/schema_version": 2/);
 assert.doesNotMatch(src,/frappe\.db\.commit\(/);
});
