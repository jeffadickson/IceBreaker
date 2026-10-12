'use strict';
// Development vertical slice: SQLite journal compatible with Icebreaker.Core's
// game_events / sync_outbox schema. Node 22 built-in SQLite is experimental.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const validSide=x=>x==='home'||x==='away';
const validAttr=(x,scorer=false)=>x==='TBD'||(!scorer&&x==='None')||/^\d{1,3}$/.test(String(x));
const isInt=(x,lo,hi)=>Number.isInteger(x)&&x>=lo&&x<=hi;
const clean=(s,n=80)=>String(s??'').replace(/[<>\x00-\x1f]/g,'').slice(0,n);
function attr(x){return x==='TBD'?{kind:'Tbd',playerId:null}:x==='None'?{kind:'None',playerId:null}:{kind:'Player',playerId:String(x)};}
function unattr(x){return x?.kind==='Player'?x.playerId:x?.kind==='None'?'None':'TBD';}
function validate(c,state){if(!c||typeof c!=='object')throw Error('Invalid command');
 if(c.type==='GOAL_RECORDED'||c.type==='GOAL_ATTRIBUTION_CORRECTED'){
  if(c.type==='GOAL_RECORDED'&&!validSide(c.team))throw Error('Invalid team');
  if(c.type==='GOAL_ATTRIBUTION_CORRECTED'&&(!state.goals.has(c.originalEventId)||state.goals.get(c.originalEventId).voided))throw Error('Unknown goal');
  if(!validAttr(c.scorer,true)||!validAttr(c.assist1)||!validAttr(c.assist2))throw Error('Invalid attribution');
  const players=[c.scorer,c.assist1,c.assist2].filter(x=>x!=='TBD'&&x!=='None').map(String);
  if(new Set(players).size!==players.length)throw Error('Duplicate player attribution');
  if(c.type==='GOAL_ATTRIBUTION_CORRECTED'&&!clean(c.reason))throw Error('Correction reason required');
 }else if(c.type==='PENALTY_ASSESSED'){
  if(!validSide(c.team)||!validAttr(c.player,true)||!clean(c.infraction)||!isInt(c.duration,1,3600))throw Error('Invalid penalty');
  if(c.classification!==undefined&&!['MINOR','DOUBLE_MINOR','MAJOR','MISCONDUCT','GAME_MISCONDUCT','MATCH','OTHER'].includes(c.classification))throw Error('Invalid penalty classification');
 }else if(c.type==='SHOT_RECORDED'){
  if(!validSide(c.team))throw Error('Invalid shot team');
 }else if(c.type==='CLOCK_UPDATED'){
  if(!['START','STOP','SET'].includes(c.action)||!isInt(c.seconds,0,3600))throw Error('Invalid clock action');
 }else if(['PERIOD_ENDED','PERIOD_ADVANCED','GAME_ENDED'].includes(c.type)){
  if(c.type==='PERIOD_ADVANCED'&&state.period>=9)throw Error('Period limit');
 }else if(c.type==='MERCY_MODE_CHANGED'){
  if(typeof c.active!=='boolean'||typeof c.hasTriggered!=='boolean'||!clean(c.reason))throw Error('Invalid mercy change');
 }else throw Error('Unsupported command');
}
function project(events){const state={revision:0,period:1,seconds:900,running:false,scores:{home:0,away:0},shots:{home:0,away:0},goals:new Map(),events:[],mercy:{enabled:true,threshold:5,cap:5,triggered:false},ended:false};
 for(const e of events){if(e.seq!==state.revision+1)throw Error('Journal sequence gap');const d=JSON.parse(e.payload_json);const item={id:e.event_id,type:e.event_type,team:d.teamId||null,period:e.period,seconds:e.clock_seconds,at:e.occurred_at_utc,details:{}};
  state.period=e.period;state.seconds=e.clock_seconds;
  if(e.event_type==='GOAL_RECORDED'){state.scores[d.teamId]++;state.shots[d.teamId]++;state.goals.set(e.event_id,{goalId:d.goalId,voided:false});item.details={scorer:unattr(d.scorer),assist1:unattr(d.assist1),assist2:unattr(d.assist2)};if(Math.abs(state.scores.home-state.scores.away)>=state.mercy.threshold)state.mercy.triggered=true;}
  if(e.event_type==='GOAL_ATTRIBUTION_CORRECTED'){const target=state.events.find(x=>x.type==='GOAL_RECORDED'&&state.goals.get(x.id)?.goalId===d.goalId);if(!target)throw Error('Missing correction target');item.details={originalEventId:target.id,scorer:unattr(d.scorer),assist1:unattr(d.assist1),assist2:unattr(d.assist2)};}
  if(e.event_type==='PENALTY_ASSESSED')item.details={player:unattr(d.player),infraction:d.infraction,duration:d.durationSeconds,classification:d.classification||'MINOR'};
  if(e.event_type==='SHOT_RECORDED'){state.shots[d.teamId]++;item.details={shotNumber:state.shots[d.teamId]};}
  if(e.event_type==='CLOCK_UPDATED')state.running=d.action==='START'?true:d.action==='STOP'?false:state.running;
  if(e.event_type==='PERIOD_ENDED'||e.event_type==='GAME_ENDED')state.running=false;
  if(e.event_type==='PERIOD_ADVANCED'){state.period=e.period;state.seconds=e.clock_seconds;state.running=false;}
  if(e.event_type==='GAME_ENDED')state.ended=true;
  if(e.event_type==='MERCY_MODE_CHANGED')state.mercy.triggered=d.hasTriggered;
  state.events.push(item);state.revision=e.seq;
 }
 return state;
}
class Authority{
 constructor({dbPath,gameId='demo',auditPath,mirrorPath}){this.gameId=gameId;this.dbPath=dbPath;this.auditPath=auditPath||dbPath+'.actions.jsonl';this.mirrorPath=mirrorPath||dbPath+'.events.log';fs.mkdirSync(path.dirname(dbPath),{recursive:true});this.db=new DatabaseSync(dbPath);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');this.db.exec(`CREATE TABLE IF NOT EXISTS game_events (game_id TEXT NOT NULL,seq INTEGER NOT NULL,event_id TEXT NOT NULL UNIQUE,idempotency_key TEXT NOT NULL,event_type TEXT NOT NULL,occurred_at_utc TEXT NOT NULL,actor_id TEXT NOT NULL,period INTEGER NOT NULL,clock_seconds INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(game_id,seq),UNIQUE(game_id,idempotency_key)); CREATE TABLE IF NOT EXISTS sync_outbox (event_id TEXT PRIMARY KEY NOT NULL REFERENCES game_events(event_id),game_id TEXT NOT NULL,seq INTEGER NOT NULL,delivered INTEGER NOT NULL DEFAULT 0);`);this.state=project(this.rows());this.clockAnchor=null;this.audit('BACKEND_STARTED',{revision:this.state.revision});this.repairMirror();if(this.state.running){this.command({type:'CLOCK_UPDATED',action:'STOP',seconds:this.state.seconds},{actor:'system-recovery',key:'recovery-'+crypto.randomUUID()});}this.clockAnchor=this.state.running?process.hrtime.bigint():null;}
 rows(){return this.db.prepare('SELECT * FROM game_events WHERE game_id=? ORDER BY seq').all(this.gameId);}
 audit(action,details={}){const entry={at:new Date().toISOString(),action,details};fs.mkdirSync(path.dirname(this.auditPath),{recursive:true});fs.appendFileSync(this.auditPath,JSON.stringify(entry)+'\n');}
 repairMirror(){const lines=this.rows().map(e=>`${e.seq.toString().padStart(5,'0')} ${e.occurred_at_utc} P${e.period} ${String(Math.floor(e.clock_seconds/60)).padStart(2,'0')}:${String(e.clock_seconds%60).padStart(2,'0')} ${e.event_type} ${e.event_id} ${e.payload_json}`).join('\n');try{fs.writeFileSync(this.mirrorPath,lines+(lines?'\n':''));this.mirrorHealthy=true;}catch(err){this.mirrorHealthy=false;this.audit('TEXT_MIRROR_FAILURE',{message:err.message});}}
 currentSeconds(){if(!this.state.running||this.clockAnchor===null)return this.state.seconds;return Math.max(0,this.state.seconds-Math.floor(Number(process.hrtime.bigint()-this.clockAnchor)/1e9));}
 spectator(){const s=this.state;return {revision:s.revision,period:s.period,seconds:this.currentSeconds(),running:s.running,scores:{...s.scores},shots:{...s.shots},ended:s.ended,events:s.events.filter(e=>['GOAL_RECORDED','PENALTY_ASSESSED','GOAL_ATTRIBUTION_CORRECTED','PERIOD_ENDED','PERIOD_ADVANCED','GAME_ENDED','SHOT_RECORDED'].includes(e.type)),teams:{home:'Pasadena Maple Leafs',away:'Santa Clarita Flyers'},connected:true,scorePolicy:'FULL_OFFICIAL'};}
 arena(){const s=this.state;let {home,away}=s.scores;const m=s.mercy;if(m.enabled&&(m.triggered||Math.abs(home-away)>=m.threshold)){if(home>away)home=Math.min(home,away+m.cap);else away=Math.min(away,home+m.cap);}return {revision:s.revision,period:s.period,seconds:this.currentSeconds(),running:s.running,scores:{home,away},shots:{...s.shots},scorePolicy:'MERCY_DISPLAY_CAP',teams:{home:'Pasadena Maple Leafs',away:'Santa Clarita Flyers'}};}
 command(c,{actor='scorekeeper',key}={}){
  if(!key||!/^[-\w]{8,128}$/.test(key))throw Error('Idempotency key required');
  const duplicate=this.db.prepare('SELECT event_id,seq FROM game_events WHERE game_id=? AND idempotency_key=?').get(this.gameId,key);if(duplicate){this.audit('DUPLICATE_COMMAND',{key,eventId:duplicate.event_id});return {eventId:duplicate.event_id,revision:duplicate.seq,duplicate:true};}
  if(this.state.ended)throw Error('Game is final');validate(c,this.state);
  const id=crypto.randomUUID(),seq=this.state.revision+1,at=new Date().toISOString();let period=this.state.period,seconds=this.state.seconds,payload={};
  if(c.type==='GOAL_RECORDED')payload={goalId:id,teamId:c.team,scorer:attr(c.scorer),assist1:attr(c.assist1),assist2:attr(c.assist2)};
  if(c.type==='GOAL_ATTRIBUTION_CORRECTED')payload={goalId:this.state.goals.get(c.originalEventId).goalId,scorer:attr(c.scorer),assist1:attr(c.assist1),assist2:attr(c.assist2),reason:clean(c.reason,200)};
  if(c.type==='PENALTY_ASSESSED')payload={penaltyId:id,teamId:c.team,player:attr(c.player),infraction:clean(c.infraction,80),durationSeconds:c.duration,classification:c.classification||'MINOR'};
  if(c.type==='SHOT_RECORDED')payload={teamId:c.team};
  if(c.type==='CLOCK_UPDATED'){seconds=c.action==='STOP'?this.currentSeconds():c.seconds;payload={action:c.action,secondsRemaining:seconds};}else if(this.state.running){seconds=this.currentSeconds();}
  if(c.type==='PERIOD_ADVANCED'){period++;seconds=isInt(c.seconds,0,3600)?c.seconds:900;}
  if(c.type==='PERIOD_ENDED'||c.type==='GAME_ENDED'){seconds=isInt(c.seconds,0,3600)?c.seconds:seconds;}
  if(c.type==='MERCY_MODE_CHANGED')payload={active:c.active,hasTriggered:c.hasTriggered,reason:clean(c.reason,200)};
  const record={game_id:this.gameId,seq,event_id:id,idempotency_key:key,event_type:c.type,occurred_at_utc:at,actor_id:clean(actor,80),period,clock_seconds:seconds,payload_json:JSON.stringify(payload)};
  this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO game_events VALUES (?,?,?,?,?,?,?,?,?,?)').run(...Object.values(record));this.db.prepare('INSERT INTO sync_outbox(event_id,game_id,seq) VALUES(?,?,?)').run(id,this.gameId,seq);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  this.state=project(this.rows());this.clockAnchor=this.state.running?process.hrtime.bigint():null;this.audit('COMMAND_COMMITTED',{type:c.type,eventId:id,revision:seq,actor});this.repairMirror();return {eventId:id,revision:seq,duplicate:false,mirrorHealthy:this.mirrorHealthy};
 }
 close(){this.db.close();}
}
module.exports={Authority,project,validate,attr,unattr};
