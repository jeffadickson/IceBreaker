'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifyFrappeSchedule,canonical}=require('../../server/frappe-schedule-verifier');
const issued='2026-10-13T20:00:00Z',expires='2026-10-14T20:00:00Z';
const now=Date.parse('2026-10-13T21:00:00Z');
function fixture(){
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
 const unsigned={schema_version:1,fictional:true,league_id:'demo-league',
  issued_at:issued,expires_at:expires,issuer:'icebreaker-league-dev',
  key_id:'dev-schedule-key',games:[{game_id:'game-001',division_id:'demo-10u',
   home_team_id:'maple',away_team_id:'flyers',scheduled_utc:'2026-10-14T18:00:00Z',
   schedule_status:'Scheduled'}]};
 const signature=crypto.sign(null,Buffer.from(canonical(unsigned),'ascii'),privateKey).toString('base64');
 const pub=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 const trust={'dev-schedule-key':{issuer:'icebreaker-league-dev',leagues:['demo-league'],public_key_base64:pub}};
 return {bundle:{...unsigned,signature},trust};
}
function verify(x,extra={}){return verifyFrappeSchedule(x.bundle,x.trust,'demo-league',{now,...extra});}
test('signed Frappe schedule verifies with pinned issuer/league and remains read-only',()=>{
 const x=fixture(),result=verify(x);
 assert.equal(result.gameCount,1);
 assert.equal(result.leagueId,'demo-league');
 assert.match(result.bundleSha256,/^[a-f0-9]{64}$/);
});
test('tampering, extra private fields, invalid league and wrong key fail closed',()=>{
 const x=fixture();
 for(const mutate of [
  b=>{b.games[0].scheduled_utc='2026-10-14T19:00:00Z';},
  b=>{b.games[0].birth_date='2016-01-01';},
  b=>{b.league_id='other-league';},
  b=>{b.games[0].home_team_id='flyers';},
  b=>{b.games[0].schedule_status='Final';},
 ]){
  const clone={bundle:structuredClone(x.bundle),trust:x.trust};
  mutate(clone.bundle);
  assert.throws(()=>verify(clone));
 }
 const other=fixture();
 assert.throws(()=>verify({bundle:x.bundle,trust:other.trust}));
 assert.throws(()=>verifyFrappeSchedule(x.bundle,x.trust,'other-league',{now}));
});
test('expiry, future issue and duplicate/unsorted game identifiers rejected',()=>{
 const x=fixture();
 assert.throws(()=>verify(x,{now:Date.parse(expires)}));
 assert.throws(()=>verify(x,{now:Date.parse(issued)-360000}));
 const duplicate=structuredClone(x.bundle);
 duplicate.games.push({...duplicate.games[0]});
 assert.throws(()=>verify({bundle:duplicate,trust:x.trust}));
});
test('canonical JSON sorts nested fields consistently with Python canonical encoder',()=>{
 const x=fixture();
 const raw=canonical({z:1,a:{z:'last',a:'first'}});
 assert.equal(raw,'{"a":{"a":"first","z":"last"},"z":1}');
 assert.equal(canonical(x.bundle.games[0]).includes('"birth_date"'),false);
});
