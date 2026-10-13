'use strict';
// Development reference central ingestion server. Put behind TLS and a gateway in production.
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { URL } = require('node:url');
const MAX_BYTES = 256 * 1024;
const MAX_EVENTS = 128;
const ALLOWED_TYPES = new Set(['GOAL_RECORDED','GOAL_ATTRIBUTION_CORRECTED','SHOT_RECORDED','PENALTY_ASSESSED','PENALTY_DELAYED','PENALTY_WHISTLE','PENALTY_DELAYED_WAVED','GOALIE_CHANGED','CLOCK_UPDATED','CLOCK_SYNCED','PERIOD_ENDED','PERIOD_ADVANCED','PERIOD_STARTED','GAME_ENDED','MERCY_MODE_CHANGED','OVERTIME_STARTED','TIMEOUT_TAKEN']);
function canonical(batch) { return JSON.stringify({gameId:batch.gameId,stationId:batch.stationId,...(batch.epoch===undefined?{}:{epoch:batch.epoch}),events:batch.events}); }
function signBatch(privateKey, batch) { return crypto.sign(null,Buffer.from(canonical(batch)),privateKey).toString('base64'); }
function createCentralServer({dbPath=':memory:',host='127.0.0.1',port=0,adminKey=process.env.ICEBREAKER_INGEST_ADMIN_KEY}={}) {
 if(!adminKey || adminKey.length<24)throw Error('Configure an admin key of at least 24 characters');
 if(dbPath!==':memory:')fs.mkdirSync(path.dirname(dbPath),{recursive:true});
 const db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 db.exec(`CREATE TABLE IF NOT EXISTS stations(id TEXT PRIMARY KEY, public_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS assignments(game_id TEXT NOT NULL, station_id TEXT NOT NULL REFERENCES stations(id), PRIMARY KEY(game_id,station_id));
 CREATE TABLE IF NOT EXISTS game_owners(game_id TEXT PRIMARY KEY, station_id TEXT NOT NULL REFERENCES stations(id), epoch INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS game_events(game_id TEXT NOT NULL, seq INTEGER NOT NULL, event_id TEXT NOT NULL, station_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, digest TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY(game_id,seq), UNIQUE(game_id,event_id));
 CREATE TABLE IF NOT EXISTS ingestion_audit(id INTEGER PRIMARY KEY AUTOINCREMENT, happened_at TEXT NOT NULL, action TEXT NOT NULL, game_id TEXT, station_id TEXT, detail TEXT);`);
 const listeners=new Map();
 const audit=(action,gameId,stationId,detail)=>db.prepare('INSERT INTO ingestion_audit(happened_at,action,game_id,station_id,detail) VALUES(?,?,?,?,?)').run(new Date().toISOString(),action,gameId||null,stationId||null,String(detail||'').slice(0,300));
 const json=(res,status,payload)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(payload));};
 async function body(req){let parts=[],n=0;for await(const part of req){n+=part.length;if(n>MAX_BYTES)throw Object.assign(new Error('Too large'),{status:413});parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}}
 function validId(s){return typeof s==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(s);}
 function ingest(batch, signature){
  if(!batch||!validId(batch.gameId)||!validId(batch.stationId)||(batch.epoch!==undefined&&(!Number.isSafeInteger(batch.epoch)||batch.epoch<1))||!Array.isArray(batch.events)||batch.events.length<1||batch.events.length>MAX_EVENTS)throw Object.assign(new Error('Invalid batch'),{status:400});
  const station=db.prepare('SELECT * FROM stations WHERE id=?').get(batch.stationId);
  const owner=db.prepare('SELECT station_id,epoch FROM game_owners WHERE game_id=?').get(batch.gameId);
  if(owner && owner.station_id!==batch.stationId){audit('DENIED',batch.gameId,batch.stationId,'fenced: another station owns game');throw Object.assign(new Error('Another station owns this game'),{status:409});}
  // Fencing epoch is signed as part of the batch. Legacy epoch-1 clients are
  // accepted only before the first ownership transfer; they cannot return later.
  if(owner && (batch.epoch===undefined?owner.epoch!==1:batch.epoch!==owner.epoch)){
   audit('DENIED',batch.gameId,batch.stationId,'stale ownership epoch');
   throw Object.assign(new Error('Stale ownership epoch'),{status:409,expectedEpoch:owner.epoch});
  }
  if(!station||!station.enabled||!db.prepare('SELECT 1 FROM assignments WHERE game_id=? AND station_id=?').get(batch.gameId,batch.stationId)){audit('DENIED',batch.gameId,batch.stationId,'unassigned station');throw Object.assign(new Error('Station not authorized for game'),{status:403});}
  let verified=false;try{verified=crypto.verify(null,Buffer.from(canonical(batch)),crypto.createPublicKey(station.public_key),Buffer.from(String(signature||''),'base64'));}catch{}
  if(!verified){audit('DENIED',batch.gameId,batch.stationId,'invalid signature');throw Object.assign(new Error('Invalid signature'),{status:401});}
  // Validation before transaction, including uniqueness inside the submitted batch.
  const seen=new Set();for(const event of batch.events){if(!event||!Number.isSafeInteger(event.seq)||event.seq<1||!validId(event.id)||!validId(event.type)||!ALLOWED_TYPES.has(event.type)||!event.data||typeof event.data!=='object'||Array.isArray(event.data)||seen.has(event.seq)||JSON.stringify(event.data).length>16000)throw Object.assign(new Error('Invalid or repeated event'),{status:400});seen.add(event.seq);}
  const sorted=[...batch.events].sort((a,b)=>a.seq-b.seq);let accepted=[],duplicates=[];
  db.exec('BEGIN IMMEDIATE');
  try{
   let next=(db.prepare('SELECT MAX(seq) AS n FROM game_events WHERE game_id=?').get(batch.gameId).n||0)+1;
   for(const event of sorted){const payload=JSON.stringify(event.data);const digest=crypto.createHash('sha256').update(JSON.stringify({gameId:batch.gameId,seq:event.seq,id:event.id,type:event.type,data:event.data})).digest('hex');
    const old=db.prepare('SELECT * FROM game_events WHERE game_id=? AND seq=?').get(batch.gameId,event.seq);
    if(old){if(old.event_id!==event.id||old.digest!==digest||old.station_id!==batch.stationId)throw Object.assign(new Error('Conflicting replay'),{status:409});duplicates.push(event.seq);continue;}
    if(event.seq!==next)throw Object.assign(new Error(`Expected event sequence ${next}, received ${event.seq}`),{status:409,expectedSequence:next});
    if(db.prepare('SELECT 1 FROM game_events WHERE game_id=? AND event_id=?').get(batch.gameId,event.id))throw Object.assign(new Error('Event ID already used'),{status:409});
    db.prepare('INSERT INTO game_events(game_id,seq,event_id,station_id,kind,payload,digest,received_at) VALUES(?,?,?,?,?,?,?,?)').run(batch.gameId,event.seq,event.id,batch.stationId,event.type,payload,digest,new Date().toISOString());accepted.push(event.seq);next++;
   }
   audit('BATCH_ACCEPTED',batch.gameId,batch.stationId,`accepted=${accepted.length}; duplicates=${duplicates.length}`);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');audit('BATCH_REJECTED',batch.gameId,batch.stationId,e.message);throw e;}
  if(accepted.length){const subscribers=listeners.get(batch.gameId)||new Set();const latest=nextSnapshot(batch.gameId);for(const res of subscribers){try{res.write(`id: ${latest.lastSequence}\nevent: update\ndata: ${JSON.stringify(latest)}\n\n`);}catch{subscribers.delete(res);}}}
  return {gameId:batch.gameId,epoch:owner?.epoch||1,accepted,duplicates,nextSequence:(db.prepare('SELECT MAX(seq) AS n FROM game_events WHERE game_id=?').get(batch.gameId).n||0)+1};
 }
 function nextSnapshot(gameId){const rows=db.prepare('SELECT seq,event_id,kind,payload,received_at FROM game_events WHERE game_id=? ORDER BY seq').all(gameId);let home=0,away=0,shotsHome=0,shotsAway=0,period=1,status='scheduled';for(const e of rows){const d=JSON.parse(e.payload);if(e.kind==='GOAL_RECORDED'){if((d.team||d.teamId)==='home'){home++;shotsHome++;}if((d.team||d.teamId)==='away'){away++;shotsAway++;}}if(e.kind==='SHOT_RECORDED'){if((d.team||d.teamId)==='home')shotsHome++;if((d.team||d.teamId)==='away')shotsAway++;}if(e.kind==='PERIOD_STARTED'){period=d.period;status='live';}if(e.kind==='PERIOD_ADVANCED'){period=d.period||period+1;status='live';}if(e.kind==='GAME_ENDED')status='provisional_final';}return {gameId,lastSequence:rows.at(-1)?.seq||0,status,period,score:{home,away},shots:{home:shotsHome,away:shotsAway},events:rows.map(e=>({seq:e.seq,id:e.event_id,type:e.kind,data:JSON.parse(e.payload),receivedAt:e.received_at}))};}
 const server=http.createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;
  try{
   if(req.method==='GET'&&pathname==='/health')return json(res,200,{status:'ok'});
   if(req.method==='POST'&&(pathname==='/admin/stations'||pathname==='/admin/assignments'||pathname==='/admin/stations/revoke'||pathname==='/admin/games/transfer')){
    const supplied=String(req.headers['x-admin-key']||'');if(supplied.length!==adminKey.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(adminKey)))return json(res,403,{error:'Denied'});
    const b=await body(req);
    if(pathname==='/admin/stations'){if(!validId(b.stationId)||typeof b.publicKey!=='string')throw Object.assign(new Error('Invalid station'),{status:400});crypto.createPublicKey(b.publicKey);db.prepare('INSERT INTO stations(id,public_key) VALUES(?,?)').run(b.stationId,b.publicKey);audit('STATION_REGISTERED',null,b.stationId,'registered');return json(res,201,{stationId:b.stationId});}
    if(pathname==='/admin/stations/revoke'){
     if(!validId(b.stationId))throw Object.assign(new Error('Invalid station'),{status:400});
     const changed=db.prepare('UPDATE stations SET enabled=0 WHERE id=? AND enabled=1').run(b.stationId);
     audit('STATION_REVOKED',null,b.stationId,changed.changes?'revoked':'already revoked or missing');
     return json(res,200,{revoked:changed.changes===1});
    }
    if(!validId(b.stationId)||!validId(b.gameId))throw Object.assign(new Error('Invalid assignment'),{status:400});
    if(pathname==='/admin/games/transfer'){
     const dest=db.prepare('SELECT enabled FROM stations WHERE id=?').get(b.stationId);
     if(!dest||!dest.enabled)throw Object.assign(new Error('Target station unavailable'),{status:409});
     const owner=db.prepare('SELECT * FROM game_owners WHERE game_id=?').get(b.gameId);
     if(!owner)throw Object.assign(new Error('Game has no owner'),{status:404});
     if(owner.station_id===b.stationId)throw Object.assign(new Error('Station already owns game'),{status:409});
     db.exec('BEGIN IMMEDIATE');try{
      db.prepare('INSERT OR IGNORE INTO assignments(game_id,station_id) VALUES(?,?)').run(b.gameId,b.stationId);
      db.prepare('UPDATE game_owners SET station_id=?,epoch=epoch+1 WHERE game_id=?').run(b.stationId,b.gameId);
      audit('GAME_TRANSFERRED',b.gameId,b.stationId,`from=${owner.station_id};epoch=${owner.epoch+1}`);
      db.exec('COMMIT');
     }catch(e){db.exec('ROLLBACK');throw e;}
     return json(res,200,{transferred:true,epoch:owner.epoch+1});
    }
    const station=db.prepare('SELECT enabled FROM stations WHERE id=?').get(b.stationId);
    if(!station||!station.enabled)throw Object.assign(new Error('Station unavailable'),{status:409});
    const previous=db.prepare('SELECT station_id,epoch FROM game_owners WHERE game_id=?').get(b.gameId);
    if(previous && previous.station_id!==b.stationId)throw Object.assign(new Error('Game already assigned to a station; use transfer'),{status:409});
    db.exec('BEGIN IMMEDIATE');try{
     db.prepare('INSERT OR IGNORE INTO game_owners(game_id,station_id,epoch) VALUES(?,?,1)').run(b.gameId,b.stationId);
     db.prepare('INSERT OR IGNORE INTO assignments(game_id,station_id) VALUES(?,?)').run(b.gameId,b.stationId);
     audit('GAME_ASSIGNED',b.gameId,b.stationId,'exclusive owner');db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    return json(res,201,{assigned:true,epoch:previous?.epoch||1});
   }
   if(req.method==='POST'&&pathname==='/api/ingest/v1/batches'){const b=await body(req);return json(res,200,ingest(b,req.headers['x-station-signature']));}
   const match=pathname.match(/^\/api\/public\/v1\/games\/([a-zA-Z0-9_-]+)(\/events)?$/);
   if(req.method==='GET'&&match){const id=match[1];if(match[2]){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store','x-accel-buffering':'no'});if(!listeners.has(id))listeners.set(id,new Set());listeners.get(id).add(res);res.write(`event: snapshot\ndata: ${JSON.stringify(nextSnapshot(id))}\n\n`);req.on('close',()=>listeners.get(id)?.delete(res));return;}return json(res,200,nextSnapshot(id));}
   return json(res,404,{error:'Not found'});
  }catch(e){return json(res,e.status||400,{error:e.message,...(e.expectedSequence?{expectedSequence:e.expectedSequence}:{}),...(e.expectedEpoch?{expectedEpoch:e.expectedEpoch}:{})});}
 });
 return {start:()=>new Promise(r=>server.listen(port,host,()=>r(server.address())),),close:()=>new Promise(r=>server.close(()=>{db.close();r();})),db,ingest,snapshot:nextSnapshot};
}
if(require.main===module){const instance=createCentralServer({dbPath:process.env.ICEBREAKER_CENTRAL_DB||path.join(__dirname,'../../data/central.sqlite'),host:process.env.ICEBREAKER_BIND||'127.0.0.1',port:Number(process.env.PORT||8091)});instance.start().then(a=>console.log(`Central ingest listening on ${a.address}:${a.port}`));}
module.exports={createCentralServer,canonical,signBatch};