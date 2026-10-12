'use strict';
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
const {signBatch}=require('./central-server');
// Pulls the authoritative SQLite journal/outbox. Never marks delivered before acknowledgement.
// A retry reuses the same event IDs/sequence numbers and is safe after a lost response.
class RinkSyncClient {
 constructor({dbPath,remoteUrl,gameId,stationId,privateKey,fetchImpl=fetch}){
  if(!dbPath||!remoteUrl||!gameId||!stationId||!privateKey)throw Error('Missing sync configuration');
  this.dbPath=dbPath;this.remoteUrl=remoteUrl.replace(/\/$/,'');this.gameId=gameId;this.stationId=stationId;
  this.privateKey=privateKey.includes?.('BEGIN')?crypto.createPrivateKey(privateKey):privateKey;
  this.fetch=fetchImpl;
 }
 async flush({maxEvents=64}={}){
  const db=new DatabaseSync(this.dbPath);
  try{
   const rows=db.prepare(`SELECT e.* FROM game_events e JOIN sync_outbox o ON o.event_id=e.event_id
     WHERE e.game_id=? AND o.delivered=0 ORDER BY e.seq LIMIT ?`).all(this.gameId,maxEvents);
   if(!rows.length)return {accepted:[],duplicates:[],empty:true};
   const events=rows.map(e=>({seq:e.seq,id:e.event_id,type:e.event_type,data:{
    ...JSON.parse(e.payload_json),period:e.period,clockSeconds:e.clock_seconds,occurredAt:e.occurred_at_utc
   }}));
   const batch={gameId:this.gameId,stationId:this.stationId,events};
   const result=await this.fetch(`${this.remoteUrl}/api/ingest/v1/batches`,{method:'POST',headers:{'content-type':'application/json','x-station-signature':signBatch(this.privateKey,batch)},body:JSON.stringify(batch)});
   const response=await result.json();if(!result.ok)throw Object.assign(new Error(`Central ingest ${result.status}: ${response.error||'Rejected'}`),{status:result.status,response});
   const ack=new Set([...(response.accepted||[]),...(response.duplicates||[])]);
   db.exec('BEGIN IMMEDIATE');try{const stmt=db.prepare('UPDATE sync_outbox SET delivered=1 WHERE event_id=? AND game_id=? AND seq=?');for(const e of rows){if(ack.has(e.seq))stmt.run(e.event_id,this.gameId,e.seq);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   return response;
  }finally{db.close();}
 }
}
module.exports={RinkSyncClient};
