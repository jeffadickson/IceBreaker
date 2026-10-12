'use strict';
// Durable, version-pinned workflow interpreter for the constrained IceBreaker policy
// format. This is NOT Elsa; adopting Elsa requires a separate .NET host/adapter.
const fs=require('node:fs');
const crypto=require('node:crypto');
// Optional, legacy integration only. Normal IceBreaker operation has no Elsa dependency.
const legacyElsaBridge=process.env.ICEBREAKER_ENABLE_ELSA_BRIDGE==='1'
  ?require('../../../services/elsa-workflows/bridge-outbox'):null;
const fingerprint=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const policyFromFile=file=>{
 const p=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!/^[-\w.]+$/.test(p.id)||!/^\d+\.\d+\.\d+$/.test(p.version)||!Array.isArray(p.states)||!Array.isArray(p.transitions))throw Error('Malformed workflow definition');
 const states=new Set(p.states),ids=new Set();
 for(const t of p.transitions){if(!states.has(t.from)||!states.has(t.to)||!/^[-\w]+$/.test(t.action)||!/^[-\w]+$/.test(t.role)||ids.has(t.from+':'+t.action))throw Error('Invalid or ambiguous workflow transition');ids.add(t.from+':'+t.action);}
 return Object.freeze(p);
};
class WorkflowRuntime {
 constructor(db,gameId,definition){this.db=db;this.gameId=gameId;this.definition=definition;this.digest=fingerprint(definition);if(legacyElsaBridge)legacyElsaBridge.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS workflow_instances(game_id TEXT NOT NULL,workflow_id TEXT NOT NULL,version TEXT NOT NULL,definition_digest TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(game_id,workflow_id));
  CREATE TABLE IF NOT EXISTS workflow_history(game_id TEXT NOT NULL,workflow_id TEXT NOT NULL,seq INTEGER NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,from_state TEXT NOT NULL,to_state TEXT NOT NULL,scoresheet_revision INTEGER,document_digest TEXT,at TEXT NOT NULL,PRIMARY KEY(game_id,workflow_id,seq));
  CREATE TABLE IF NOT EXISTS certification_delivery_outbox(delivery_key TEXT PRIMARY KEY,game_id TEXT NOT NULL,scoresheet_revision INTEGER NOT NULL,document_digest TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('LEAGUE_PUBLICATION','PARENT_REPORT')),status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DELIVERED','BLOCKED')),created_at TEXT NOT NULL,delivered_at TEXT,details TEXT);`);
  const prev=db.prepare('SELECT * FROM workflow_instances WHERE game_id=? AND workflow_id=?').get(gameId,definition.id);
  if(prev&&(prev.version!==definition.version||prev.definition_digest!==this.digest))throw Error('Workflow definition changed: existing game requires pinned version');
  if(!prev){const latest=db.prepare('SELECT status FROM scoresheet_revisions WHERE game_id=? ORDER BY revision DESC LIMIT 1').get(gameId);const initial=latest?(latest.status==='CERTIFIED'?'CERTIFIED':latest.status==='SUBMITTED'?'SUBMITTED':'CORRECTION_REQUESTED'):'FINAL_UNOFFICIAL';db.prepare('INSERT INTO workflow_instances VALUES(?,?,?,?,?,0)').run(gameId,definition.id,definition.version,this.digest,initial);}
 }
 current(){return this.db.prepare('SELECT * FROM workflow_instances WHERE game_id=? AND workflow_id=?').get(this.gameId,this.definition.id);}
 transition(action,role,actor,{revision=null,digest=null}={}){
  const before=this.current();const t=this.definition.transitions.find(t=>t.from===before.state&&t.action===action&&t.role===role);
  if(!t)throw Error(`Workflow transition denied: ${before.state} / ${action} / ${role}`);
  const result=this.db.prepare('UPDATE workflow_instances SET state=?,revision=revision+1 WHERE game_id=? AND workflow_id=? AND revision=?').run(t.to,this.gameId,this.definition.id,before.revision);
  if(result.changes!==1)throw Error('Workflow revision conflict');
  this.db.prepare('INSERT INTO workflow_history VALUES(?,?,?,?,?,?,?,?,?,?)').run(this.gameId,this.definition.id,before.revision+1,action,String(actor).slice(0,100),before.state,t.to,revision,digest,new Date().toISOString());
  // Same SQLite transaction as the workflow transition: survives any restart.
  if(legacyElsaBridge)legacyElsaBridge.enqueue(this.db,{gameId:this.gameId,action,revision:before.revision+1,definitionDigest:this.digest,state:t.to});
  return {state:t.to,workflowRevision:before.revision+1};
 }
 enqueueCertified(revision,digest){for(const type of ['LEAGUE_PUBLICATION','PARENT_REPORT']){const key=`${this.gameId}:${revision}:${digest}:${type}`;this.db.prepare('INSERT OR IGNORE INTO certification_delivery_outbox(delivery_key,game_id,scoresheet_revision,document_digest,type,created_at) VALUES(?,?,?,?,?,?)').run(key,this.gameId,revision,digest,type,new Date().toISOString());}}
 retryBlocked(){const count=this.db.prepare("UPDATE certification_delivery_outbox SET status='PENDING',details=NULL WHERE game_id=? AND status='BLOCKED'").run(this.gameId).changes;return {retried:count};}
 deliveries(){return this.db.prepare('SELECT delivery_key AS deliveryKey,type,status,scoresheet_revision AS scoresheetRevision,document_digest AS digest,details FROM certification_delivery_outbox WHERE game_id=? ORDER BY created_at,type').all(this.gameId);}
 history(){return this.db.prepare('SELECT * FROM workflow_history WHERE game_id=? AND workflow_id=? ORDER BY seq').all(this.gameId,this.definition.id);}
}
module.exports={WorkflowRuntime,policyFromFile};