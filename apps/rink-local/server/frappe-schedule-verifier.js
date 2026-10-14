'use strict';
// M3 schedule-only verification for future offline rink staging.
// This module never changes the authoritative rink game, clock or roster.
const crypto=require('node:crypto');
const FIELD_NAMES=['schema_version','fictional','league_id','issued_at','expires_at','issuer','key_id','games'];
const GAME_FIELDS=['game_id','division_id','home_team_id','away_team_id','scheduled_utc','schedule_status'];
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{1,99}$/;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const SPKI_ED25519=Buffer.from('302a300506032b6570032100','hex');
const exact=(value,fields)=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===fields.length&&fields.every(k=>Object.hasOwn(value,k));
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function utc(value){
 if(typeof value!=='string'||!UTC.test(value))throw Error('Noncanonical UTC timestamp');
 const ms=Date.parse(value);
 if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,19)+'Z'!==value)
  throw Error('Invalid UTC timestamp');
 return ms;
}
function strictBase64(value,size){
 if(typeof value!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
  throw Error('Invalid signature/key encoding');
 const bytes=Buffer.from(value,'base64');
 if(bytes.length!==size||bytes.toString('base64')!==value)throw Error('Invalid signature/key length');
 return bytes;
}
function verifyFrappeSchedule(bundle,trust,expectedLeague,{now=Date.now()}={}){
 if(!exact(bundle,[...FIELD_NAMES,'signature']))throw Error('Unexpected signed schedule fields');
 const unsigned=Object.fromEntries(FIELD_NAMES.map(k=>[k,bundle[k]]));
 if(unsigned.schema_version!==1||unsigned.fictional!==true)throw Error('Unsupported schedule bundle');
 for(const field of ['league_id','issuer','key_id'])
  if(typeof unsigned[field]!=='string'||!ID.test(unsigned[field]))throw Error('Invalid bundle identity');
 if(unsigned.league_id!==expectedLeague)throw Error('Wrong league');
 const issued=utc(unsigned.issued_at),expires=utc(unsigned.expires_at);
 if(expires<=issued||expires-issued>7*86400000||now<issued-300000||now>=expires)
  throw Error('Expired or future schedule bundle');
 if(!Array.isArray(unsigned.games)||unsigned.games.length>500)throw Error('Invalid schedule size');
 let last='';
 for(const game of unsigned.games){
  if(!exact(game,GAME_FIELDS))throw Error('Unexpected schedule game fields');
  for(const key of ['game_id','division_id','home_team_id','away_team_id'])
   if(typeof game[key]!=='string'||!ID.test(game[key]))throw Error('Invalid game identity');
  if(game.game_id<=last||game.home_team_id===game.away_team_id)throw Error('Duplicate/invalid game');
  last=game.game_id;utc(game.scheduled_utc);
  if(!['Scheduled','Postponed','Cancelled'].includes(game.schedule_status))throw Error('Invalid game status');
 }
 const key=trust?.[unsigned.key_id];
 if(!key||key.issuer!==unsigned.issuer||!Array.isArray(key.leagues)||!key.leagues.includes(expectedLeague))
  throw Error('Untrusted schedule signing key or league');
 const pub=strictBase64(key.public_key_base64,32),signature=strictBase64(bundle.signature,64);
 const verified=crypto.verify(null,Buffer.from(canonical(unsigned),'ascii'),
  crypto.createPublicKey({key:Buffer.concat([SPKI_ED25519,pub]),format:'der',type:'spki'}),signature);
 if(!verified)throw Error('Schedule signature invalid');
 return {leagueId:expectedLeague,gameCount:unsigned.games.length,
  bundleSha256:crypto.createHash('sha256').update(canonical(unsigned),'ascii').digest('hex'),
  expiresAt:unsigned.expires_at};
}
module.exports={verifyFrappeSchedule,canonical};
