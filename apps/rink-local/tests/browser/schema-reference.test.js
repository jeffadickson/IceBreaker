'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {generate}=require('../../tools/generate-schema-reference');
const {parse,render}=require('../../tools/schema-catalog');
test('SCHEMA-001: all active SQLite trust domains are documented from live metadata',async()=>{
 const {data,markdown}=await generate();
 assert.equal(data.length,3);
 const league=data[0],central=data[1],evidence=data[2];
 const names=new Set(league.objects.map(x=>x.name));
 for(const name of [
  'seasons','leagues','league_seasons','divisions','division_timing_rules','teams','players',
  'roster_memberships','games','goal_attributions','certified_goalie_stats','league_audit',
  'player_private_profiles','player_related_people','player_person_links','player_suspensions',
  'registration_clubs','registration_requests','registration_users','registration_sessions',
  'training_catalog','training_policy_versions','training_completions_v2','training_intake',
  'participant_external_ids','family_accounts','family_grants','private_documents',
  'team_users','game_roster_confirmations','game_events','sync_outbox','scoresheet_revisions',
  'scoresheet_signatures','workflow_instances','workflow_history','certification_delivery_outbox',
  'parent_users','parent_sessions','parent_favorites','game_timing_policy'
 ])assert.ok(names.has(name),'Missing league schema object '+name);
 assert.ok(league.objects.length>=45,'Unexpectedly small league schema inventory');
 for(const name of ['stations','assignments','game_owners','game_events','ingestion_audit'])
  assert.ok(central.objects.some(x=>x.name===name),'Missing central schema '+name);
 for(const name of ['archived_evidence','evidence_audit'])
  assert.ok(evidence.objects.some(x=>x.name===name),'Missing evidence schema '+name);
 const users=league.objects.find(x=>x.name==='registration_users');
 assert.ok(users.columns.some(c=>c.name==='mfa_secret'),'ALTER TABLE migration column missing');
 assert.ok(users.indexes.length>0);
 const roster=league.objects.find(x=>x.name==='roster_memberships');
 assert.ok(roster.foreignKeys.some(x=>x.toTable==='players'));
 for(const table of ['registration_users','archived_evidence','game_events'])
  assert.ok(markdown.includes('### '+String.fromCharCode(96)+table+String.fromCharCode(96)));
 assert.match(markdown,/Foreign keys/);
 assert.match(markdown,/Indexes/);
 assert.doesNotMatch(markdown,/fictional-schema-admin-key-12345/);
});
test('SCHEMA-002: catalog CLI requires existing databases and does not invent paths',()=>{
 assert.throws(()=>parse(['--db','missing.sqlite']),/Usage/);
 assert.throws(()=>parse(['--db','missing.sqlite','Missing']),/does not exist/);
 assert.throws(()=>parse([]),/At least one/);
 assert.match(render([{label:'Empty',fileName:'empty.sqlite',objects:[]}]),/0 schema objects/);
});
