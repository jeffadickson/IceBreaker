'use strict';
// Development two-phase handoff: operator prepares signed central snapshot,
// restores an idle standby, then explicitly commits the ownership transfer.
// Never restores over an existing nonempty local game journal.
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {project}=require('../../apps/rink-local/server/authority-sqlite');
const {validateTiming}=require('../../apps/rink-local/server/game-timing-rules');
function sha(s){return crypto.createHash('sha256').update(s).digest('hex');}
function verifyPackage(pkg,{adminKey,gameId,stationId}){
 if(!pkg||!pkg.manifest||typeof adminKey!=='string'||adminKey.length<24)throw Error('Invalid handoff package');
 const p=pkg.manifest;
 if(p.gameId!==gameId||p.stationId!==stationId||!Number.isSafeInteger(p.expectedEpoch)||p.expectedEpoch<1||
  p.nextEpoch!==p.expectedEpoch+1||!Array.isArray(p.events)||p.events.length>100000||
  typeof p.timingVersion!=='string')throw Error('Handoff identity or epoch mismatch');
 const serialized=JSON.stringify(p),digest=sha(serialized);
 if(digest!==pkg.digest||!crypto.timingSafeEqual(Buffer.from(crypto.createHmac('sha256',adminKey).update(serialized).digest('hex')),Buffer.from(String(pkg.signature||'').padEnd(64,' ').slice(0,64))))
  throw Error('Handoff signature or digest invalid');
 let sequence=0;
 const rows=p.events.map(e=>{
  if(!e||e.seq!==++sequence||typeof e.id!=='string'||!/^[\w-]{1,80}$/.test(e.id)||
   typeof e.type!=='string'||!e.data||typeof e.data!=='object'||Array.isArray(e.data))
   throw Error('Invalid handoff journal sequence');
  const d=e.data;
  if(!Number.isSafeInteger(d.period)||d.period<1||!Number.isSafeInteger(d.clockSeconds)||d.clockSeconds<0||
   typeof d.occurredAt!=='string'||!Number.isFinite(Date.parse(d.occurredAt)))
   throw Error('Missing authoritative clock or period');
  const check=sha(JSON.stringify({gameId,seq:e.seq,id:e.id,type:e.type,data:d}));
  if(check!==e.digest)throw Error('Handoff event integrity mismatch');
  const {period,clockSeconds,occurredAt,...payload}=d;
  return {game_id:gameId,seq:e.seq,event_id:e.id,idempotency_key:'handoff-'+e.id,
   event_type:e.type,occurred_at_utc:occurredAt,actor_id:'recovered-central',
   period,clock_seconds:clockSeconds,payload_json:JSON.stringify(payload)};
 });
 const timing=validateTiming(p.timingRules);
 const state=project(rows,timing);
 if(state.running)throw Error('Cannot transfer a running clock; stop clock on authoritative laptop first');
 return {rows,timing,timingVersion:p.timingVersion,digest,epoch:p.nextEpoch,state};
}
function restoreIdleStandby({dbPath,pkg,adminKey,gameId,stationId}){
 const verified=verifyPackage(pkg,{adminKey,gameId,stationId});
 const db=new DatabaseSync(dbPath);
 try{
  db.exec('PRAGMA foreign_keys=ON');
  const policy=db.prepare('SELECT version,rules_json FROM game_timing_policy WHERE game_id=?').get(gameId);
  if(!policy||policy.version!==verified.timingVersion||
   JSON.stringify(validateTiming(JSON.parse(policy.rules_json)))!==JSON.stringify(verified.timing))
   throw Error('Standby timing policy differs from signed game policy');
  const local=db.prepare('SELECT * FROM game_events WHERE game_id=? ORDER BY seq').all(gameId);
  if(local.length)throw Error('Standby contains a game journal; manual reconciliation required');
  const pending=db.prepare('SELECT COUNT(*) n FROM sync_outbox WHERE game_id=? AND delivered=0').get(gameId).n;
  if(pending)throw Error('Standby has unsent events');
  db.exec('BEGIN IMMEDIATE');
  try{
   const insert=db.prepare('INSERT INTO game_events(game_id,seq,event_id,idempotency_key,event_type,occurred_at_utc,actor_id,period,clock_seconds,payload_json) VALUES(?,?,?,?,?,?,?,?,?,?)');
   const outbox=db.prepare('INSERT INTO sync_outbox(event_id,game_id,seq,delivered) VALUES(?,?,?,1)');
   for(const r of verified.rows){
    insert.run(r.game_id,r.seq,r.event_id,r.idempotency_key,r.event_type,r.occurred_at_utc,r.actor_id,r.period,r.clock_seconds,r.payload_json);
    outbox.run(r.event_id,gameId,r.seq);
   }
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return {restored:verified.rows.length,digest:verified.digest,epoch:verified.epoch,
   period:verified.state.period,seconds:verified.state.seconds,goalies:verified.state.goalies};
 }finally{db.close();}
}
async function handoff({remoteUrl,dbPath,gameId,stationId,adminKey,privateKey,confirm,fetchImpl=fetch}){
 if(typeof confirm!=='function'||!privateKey)throw Error('Operator confirmation and standby signing key required');
 const base=remoteUrl.replace(/\/$/,'');
 const post=async(path,body)=>{
  const res=await fetchImpl(base+path,{method:'POST',headers:{'content-type':'application/json','x-admin-key':adminKey},body:JSON.stringify(body)});
  const data=await res.json();
  if(!res.ok)throw Error('Handoff server refused: '+data.error);
  return data;
 };
 const pkg=await post('/admin/games/prepare-handoff',{gameId,stationId});
 const verified=verifyPackage(pkg,{adminKey,gameId,stationId});
 const approved=await confirm({gameId,stationId,epoch:verified.epoch,events:verified.rows.length,
  period:verified.state.period,seconds:verified.state.seconds,goalies:verified.state.goalies});
 if(approved!==true)throw Error('Operator did not confirm takeover');
 const restored=restoreIdleStandby({dbPath,pkg,adminKey,gameId,stationId});
 const receipt=JSON.stringify({gameId,stationId,digest:pkg.digest,expectedEpoch:pkg.manifest.expectedEpoch});
 const stationSignature=crypto.sign(null,Buffer.from(receipt),privateKey).toString('base64');
 const committed=await post('/admin/games/commit-handoff',{gameId,stationId,expectedEpoch:pkg.manifest.expectedEpoch,digest:pkg.digest,stationSignature});
 if(committed.epoch!==restored.epoch||committed.digest!==restored.digest)throw Error('Handoff acknowledgment mismatch');
 return {active:true,...restored};
}
module.exports={verifyPackage,restoreIdleStandby,handoff};
