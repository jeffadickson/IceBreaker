'use strict';
// Durable hand-off between the authorized SQLite workflow and Elsa host.
// No direct calls in the game-transaction critical path.
const crypto=require('node:crypto');
function ensureSchema(db){db.exec(`CREATE TABLE IF NOT EXISTS elsa_bridge_outbox(
  event_id TEXT PRIMARY KEY, game_id TEXT NOT NULL, action TEXT NOT NULL,
  revision INTEGER NOT NULL, definition_digest TEXT NOT NULL, state TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DELIVERED')),
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, delivered_at TEXT
)`);}
function enqueue(db,record){ensureSchema(db);
 const {gameId,action,revision,definitionDigest,state}=record;
 if(!gameId||!action||!Number.isInteger(revision)||!definitionDigest)throw Error('Invalid workflow event');
 const eventId=crypto.createHash('sha256').update(JSON.stringify([gameId,action,revision,definitionDigest])).digest('hex');
 db.prepare(`INSERT OR IGNORE INTO elsa_bridge_outbox(event_id,game_id,action,revision,definition_digest,state)
 VALUES(?,?,?,?,?,?)`).run(eventId,gameId,action,revision,definitionDigest,state||null);
 return eventId;
}
function pending(db,limit=25){ensureSchema(db);return db.prepare(`SELECT event_id AS eventId,game_id AS gameId,action,revision,definition_digest AS definitionDigest,state FROM elsa_bridge_outbox WHERE status='PENDING' ORDER BY rowid LIMIT ?`).all(limit);}
async function flush(db,{url,key,fetchImpl=globalThis.fetch,limit=25}){
 if(!/^https:\/\//.test(url)&&!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url))throw Error('Elsa endpoint must use HTTPS or loopback');
 if(!key||key.length<32)throw Error('Missing Elsa bridge key');
 let sent=0,failed=0;
 for(const event of pending(db,limit)){
  try {const reply=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json','X-IceBreaker-Workflow-Key':key},body:JSON.stringify(event)});
   if(!reply.ok)throw Error('Elsa HTTP status '+reply.status);
   db.prepare("UPDATE elsa_bridge_outbox SET status='DELIVERED',attempts=attempts+1,last_error=NULL,delivered_at=? WHERE event_id=? AND status='PENDING'").run(new Date().toISOString(),event.eventId);sent++;
  }catch(err){db.prepare('UPDATE elsa_bridge_outbox SET attempts=attempts+1,last_error=? WHERE event_id=?').run(String(err.message).slice(0,180),event.eventId);failed++;}
 }
 return {sent,failed};
}
module.exports={ensureSchema,enqueue,pending,flush};