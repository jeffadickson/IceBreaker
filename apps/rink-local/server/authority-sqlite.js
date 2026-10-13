'use strict';
// Development vertical slice: SQLite journal compatible with Icebreaker.Core's
// game_events / sync_outbox schema. Node 22 built-in SQLite is experimental.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {penaltyClock}=require('./penalty-clock');
const {validateTiming,verifyTime,nextPeriod,periodLength}=require('./game-timing-rules');
const officialLength=(timing,period)=>period>timing.periodCount?timing.overtimeSeconds:periodLength(timing,period);
const checkOfficial=(seconds,timing,period)=>verifyTime(seconds,timing,period>timing.periodCount?'OVERTIME':'PERIOD',Math.min(period,timing.periodCount));
const effectiveClockMode=(timing,state)=>timing.mercyRunningDifferential>0&&Math.abs(state.scores.home-state.scores.away)>=timing.mercyRunningDifferential?'RUNNING':timing.clockMode;
const validSide=x=>x==='home'||x==='away';
const validAttr=(x,scorer=false)=>x==='TBD'||(!scorer&&x==='None')||/^\d{1,3}$/.test(String(x));
const isInt=(x,lo,hi)=>Number.isInteger(x)&&x>=lo&&x<=hi;
const clean=(s,n=80)=>String(s??'').replace(/[<>\x00-\x1f]/g,'').slice(0,n);
function attr(x){return x==='TBD'?{kind:'Tbd',playerId:null}:x==='None'?{kind:'None',playerId:null}:{kind:'Player',playerId:String(x)};}
function unattr(x){return x?.kind==='Player'?x.playerId:x?.kind==='None'?'None':'TBD';}
function validate(c,state,timing=validateTiming()){if(!c||typeof c!=='object')throw Error('Invalid command');
 if(c.type==='GOAL_RECORDED'||c.type==='GOAL_ATTRIBUTION_CORRECTED'){
  if(c.type==='GOAL_RECORDED'&&!validSide(c.team))throw Error('Invalid team');
  if(c.type==='GOAL_ATTRIBUTION_CORRECTED'&&(!state.goals.has(c.originalEventId)||state.goals.get(c.originalEventId).voided))throw Error('Unknown goal');
  if(!validAttr(c.scorer,true)||!validAttr(c.assist1)||!validAttr(c.assist2))throw Error('Invalid attribution');
  const players=[c.scorer,c.assist1,c.assist2].filter(x=>x!=='TBD'&&x!=='None').map(String);
  if(new Set(players).size!==players.length)throw Error('Duplicate player attribution');
  if(c.type==='GOAL_ATTRIBUTION_CORRECTED'&&!clean(c.reason))throw Error('Correction reason required');
 }else if(c.type==='PENALTY_ASSESSED'||c.type==='PENALTY_DELAYED'){
  if(!validSide(c.team)||!validAttr(c.player,true)||!clean(c.infraction)||!isInt(c.duration,1,3600))throw Error('Invalid penalty');
  if(c.coincidental!==undefined&&typeof c.coincidental!=='boolean')throw Error('Invalid coincidental flag');
  if(c.servedBy!==undefined&&!validAttr(c.servedBy,true))throw Error('Invalid substitute');
  if(c.coincidentalGroup!==undefined&&!/^[-\w]{1,60}$/.test(c.coincidentalGroup))throw Error('Invalid coincidental group');
  if(c.classification!==undefined&&!['MINOR','DOUBLE_MINOR','MAJOR','MISCONDUCT','GAME_MISCONDUCT','MATCH','OTHER'].includes(c.classification))throw Error('Invalid penalty classification');
 }else if(c.type==='PENALTY_WHISTLE'||c.type==='PENALTY_DELAYED_WAVED'){
  if(c.type==='PENALTY_DELAYED_WAVED'&&!clean(c.delayedEventId))throw Error('Delayed penalty identifier required');
 }else if(c.type==='SHOT_RECORDED'){
  if(!validSide(c.team))throw Error('Invalid shot team');
 }else if(c.type==='CLOCK_UPDATED'){
  if(!['START','STOP','SET'].includes(c.action)||!Number.isInteger(c.seconds))throw Error('Invalid clock action');
  checkOfficial(c.seconds,timing,state.period);
 }else if(c.type==='CLOCK_SYNCED'){
  if(state.running)throw Error('Stop the game clock before syncing to arena clock');
  if(!Number.isInteger(c.seconds)||!clean(c.reason)||String(c.reason).length>200)throw Error('Clock synchronization requires valid time and reason');
  if(c.scope!==undefined&&!['GAME_ONLY','GAME_AND_PENALTIES'].includes(c.scope))throw Error('Invalid clock synchronization scope');
  checkOfficial(c.seconds,timing,state.period);
 }else if(['PERIOD_ENDED','PERIOD_ADVANCED','GAME_ENDED'].includes(c.type)){
  if(c.type==='PERIOD_ADVANCED'){if(state.period>=timing.periodCount)throw Error('No additional regulation period');nextPeriod(state.period,timing);if(c.seconds!==undefined)checkOfficial(c.seconds,timing,state.period+1);}
 }else if(c.type==='OVERTIME_STARTED'){
  if(!timing.overtimeSeconds||state.period!==timing.periodCount||state.running||state.scores.home!==state.scores.away||!state.periodEnded)throw Error('Overtime requires a tied, stopped end of regulation');
 }else if(c.type==='TIMEOUT_TAKEN'){
  if(!validSide(c.team)||!timing.timeoutSeconds||!timing.timeoutsPerTeam||state.running||state.timeouts[c.team]>=timing.timeoutsPerTeam)throw Error('Timeout unavailable, clock running, or allowance exhausted');
 }else if(c.type==='MERCY_MODE_CHANGED'){
  if(typeof c.active!=='boolean'||typeof c.hasTriggered!=='boolean'||!clean(c.reason))throw Error('Invalid mercy change');
 }else throw Error('Unsupported command');
}
function project(events,timing=validateTiming()){const state={revision:0,period:1,seconds:periodLength(timing,1),running:false,scores:{home:0,away:0},shots:{home:0,away:0},goals:new Map(),events:[],mercy:{enabled:true,threshold:5,cap:5,triggered:false},timeouts:{home:0,away:0},periodEnded:false,ended:false};
 for(const e of events){if(e.seq!==state.revision+1)throw Error('Journal sequence gap');const d=JSON.parse(e.payload_json);const item={id:e.event_id,type:e.event_type,team:d.teamId||null,period:e.period,seconds:e.clock_seconds,at:e.occurred_at_utc,details:{}};
  state.period=e.period;state.seconds=e.clock_seconds;
  if(e.event_type==='GOAL_RECORDED'){state.scores[d.teamId]++;state.shots[d.teamId]++;state.goals.set(e.event_id,{goalId:d.goalId,voided:false});item.details={scorer:unattr(d.scorer),assist1:unattr(d.assist1),assist2:unattr(d.assist2)};if(Math.abs(state.scores.home-state.scores.away)>=state.mercy.threshold)state.mercy.triggered=true;}
  if(e.event_type==='GOAL_ATTRIBUTION_CORRECTED'){const target=state.events.find(x=>x.type==='GOAL_RECORDED'&&state.goals.get(x.id)?.goalId===d.goalId);if(!target)throw Error('Missing correction target');item.details={originalEventId:target.id,scorer:unattr(d.scorer),assist1:unattr(d.assist1),assist2:unattr(d.assist2)};}
  if(e.event_type==='PENALTY_ASSESSED'||e.event_type==='PENALTY_DELAYED')item.details={player:unattr(d.player),servedBy:unattr(d.servedBy||d.player),infraction:d.infraction,duration:d.durationSeconds,classification:d.classification||'MINOR',coincidental:d.coincidental===true,coincidentalGroup:d.coincidentalGroup||null};
  if(e.event_type==='PENALTY_DELAYED_WAVED')item.details={delayedEventId:d.delayedEventId};
  if(e.event_type==='SHOT_RECORDED'){state.shots[d.teamId]++;item.details={shotNumber:state.shots[d.teamId]};}
  if(e.event_type==='CLOCK_UPDATED')item.details={action:d.action};
  if(e.event_type==='CLOCK_SYNCED')item.details={action:'SYNC_TO_ARENA',previousSeconds:d.previousSeconds,secondsRemaining:d.secondsRemaining,scope:d.scope||'GAME_ONLY',reason:d.reason};
  if(e.event_type==='CLOCK_UPDATED')state.running=d.action==='START'?true:d.action==='STOP'?false:state.running;
  if(e.event_type==='PERIOD_ENDED'||e.event_type==='GAME_ENDED')state.running=false;
  if(e.event_type==='PERIOD_ENDED')state.periodEnded=true;
  if(e.event_type==='PERIOD_ADVANCED'){state.period=e.period;state.seconds=e.clock_seconds;state.running=false;state.periodEnded=false;}
  if(e.event_type==='GAME_ENDED')state.ended=true;
  if(e.event_type==='GOAL_RECORDED'&&d.suddenDeath){state.ended=true;state.running=false;}
  if(e.event_type==='MERCY_MODE_CHANGED')state.mercy.triggered=d.hasTriggered;
  if(e.event_type==='TIMEOUT_TAKEN'){state.timeouts[d.teamId]++;item.details={durationSeconds:d.durationSeconds};}
  if(e.event_type==='OVERTIME_STARTED'){state.running=false;state.periodEnded=false;}
  state.events.push(item);state.revision=e.seq;
 }
 return state;
}
class Authority{
 constructor({dbPath,gameId='demo',auditPath,mirrorPath,timingRules=null,timingVersion='DEFAULT'}){this.gameId=gameId;this.dbPath=dbPath;this.auditPath=auditPath||dbPath+'.actions.jsonl';this.mirrorPath=mirrorPath||dbPath+'.events.log';fs.mkdirSync(path.dirname(dbPath),{recursive:true});this.db=new DatabaseSync(dbPath);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');this.db.exec(`CREATE TABLE IF NOT EXISTS game_events (game_id TEXT NOT NULL,seq INTEGER NOT NULL,event_id TEXT NOT NULL UNIQUE,idempotency_key TEXT NOT NULL,event_type TEXT NOT NULL,occurred_at_utc TEXT NOT NULL,actor_id TEXT NOT NULL,period INTEGER NOT NULL,clock_seconds INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(game_id,seq),UNIQUE(game_id,idempotency_key)); CREATE TABLE IF NOT EXISTS sync_outbox (event_id TEXT PRIMARY KEY NOT NULL REFERENCES game_events(event_id),game_id TEXT NOT NULL,seq INTEGER NOT NULL,delivered INTEGER NOT NULL DEFAULT 0);`);this.db.exec("CREATE TABLE IF NOT EXISTS game_timing_policy(game_id TEXT PRIMARY KEY,version TEXT NOT NULL,rules_json TEXT NOT NULL)");
 const oldTiming=this.db.prepare('SELECT * FROM game_timing_policy WHERE game_id=?').get(this.gameId);
 if(oldTiming){this.timingRules=validateTiming(JSON.parse(oldTiming.rules_json));this.timingVersion=oldTiming.version;
   if(timingRules&&(JSON.stringify(validateTiming(timingRules))!==JSON.stringify(this.timingRules)||timingVersion!==this.timingVersion))throw Error('Existing game has pinned timing policy');}
 else{if(this.rows().length&&timingRules)throw Error('Cannot assign division timing rules to an existing game journal without migration');
   this.timingRules=validateTiming(timingRules||{});this.timingVersion=timingVersion;
   this.db.prepare('INSERT INTO game_timing_policy VALUES(?,?,?)').run(this.gameId,this.timingVersion,JSON.stringify(this.timingRules));}
 this.state=project(this.rows(),this.timingRules);this.clockAnchor=null;this.audit('BACKEND_STARTED',{revision:this.state.revision});this.repairMirror();if(this.state.running){this.command({type:'CLOCK_UPDATED',action:'STOP',seconds:this.state.seconds},{actor:'system-recovery',key:'recovery-'+crypto.randomUUID()});}this.clockAnchor=this.state.running?process.hrtime.bigint():null;}
 rows(){return this.db.prepare('SELECT * FROM game_events WHERE game_id=? ORDER BY seq').all(this.gameId);}
 audit(action,details={}){const entry={at:new Date().toISOString(),action,details};fs.mkdirSync(path.dirname(this.auditPath),{recursive:true});fs.appendFileSync(this.auditPath,JSON.stringify(entry)+'\n');}
 repairMirror(){const lines=this.rows().map(e=>`${e.seq.toString().padStart(5,'0')} ${e.occurred_at_utc} P${e.period} ${String(Math.floor(e.clock_seconds/60)).padStart(2,'0')}:${String(e.clock_seconds%60).padStart(2,'0')} ${e.event_type} ${e.event_id} ${e.payload_json}`).join('\n');try{fs.writeFileSync(this.mirrorPath,lines+(lines?'\n':''));this.mirrorHealthy=true;}catch(err){this.mirrorHealthy=false;this.audit('TEXT_MIRROR_FAILURE',{message:err.message});}}
 currentSeconds(){if(!this.state.running||this.clockAnchor===null)return this.state.seconds;return Math.max(0,this.state.seconds-Math.floor(Number(process.hrtime.bigint()-this.clockAnchor)/1e9));}
 spectator(){const s=this.state;const penalties=penaltyClock(s.events,s.period,this.currentSeconds(),officialLength(this.timingRules,s.period));return {penalties,clockMode:effectiveClockMode(this.timingRules,s),timeouts:{...s.timeouts},overtime:s.period>this.timingRules.periodCount,timingRules:this.timingRules,timingVersion:this.timingVersion,revision:s.revision,period:s.period,seconds:this.currentSeconds(),running:s.running,scores:{...s.scores},shots:{...s.shots},ended:s.ended,events:s.events.filter(e=>['GOAL_RECORDED','PENALTY_ASSESSED','PENALTY_DELAYED','PENALTY_WHISTLE','PENALTY_DELAYED_WAVED','GOAL_ATTRIBUTION_CORRECTED','PERIOD_ENDED','PERIOD_ADVANCED','GAME_ENDED','SHOT_RECORDED','OVERTIME_STARTED','TIMEOUT_TAKEN'].includes(e.type)),teams:{home:'Pasadena Maple Leafs',away:'Santa Clarita Flyers'},connected:true,scorePolicy:'FULL_OFFICIAL'};}
 arena(){const s=this.state;const penalties=penaltyClock(s.events,s.period,this.currentSeconds(),officialLength(this.timingRules,s.period));let {home,away}=s.scores;const m=s.mercy;if(m.enabled&&(m.triggered||Math.abs(home-away)>=m.threshold)){if(home>away)home=Math.min(home,away+m.cap);else away=Math.min(away,home+m.cap);}return {penalties,clockMode:effectiveClockMode(this.timingRules,s),timeouts:{...s.timeouts},overtime:s.period>this.timingRules.periodCount,revision:s.revision,period:s.period,seconds:this.currentSeconds(),running:s.running,scores:{home,away},shots:{...s.shots},scorePolicy:'MERCY_DISPLAY_CAP',teams:{home:'Pasadena Maple Leafs',away:'Santa Clarita Flyers'}};}
 command(c,{actor='scorekeeper',key,authorizedPostgameCorrection=false}={}){
  if(!key||!/^[-\w]{8,128}$/.test(key))throw Error('Idempotency key required');
  const duplicate=this.db.prepare('SELECT event_id,seq FROM game_events WHERE game_id=? AND idempotency_key=?').get(this.gameId,key);if(duplicate){this.audit('DUPLICATE_COMMAND',{key,eventId:duplicate.event_id});return {eventId:duplicate.event_id,revision:duplicate.seq,duplicate:true};}
  if(this.state.ended && !(c.type==='GOAL_ATTRIBUTION_CORRECTED'&&authorizedPostgameCorrection===true))throw Error('Game is final');validate(c,this.state,this.timingRules);
  const id=crypto.randomUUID(),seq=this.state.revision+1,at=new Date().toISOString();let period=this.state.period,seconds=this.state.seconds,payload={};
  if(c.type==='GOAL_RECORDED')payload={goalId:id,teamId:c.team,scorer:attr(c.scorer),assist1:attr(c.assist1),assist2:attr(c.assist2)};
  if(c.type==='GOAL_ATTRIBUTION_CORRECTED')payload={goalId:this.state.goals.get(c.originalEventId).goalId,scorer:attr(c.scorer),assist1:attr(c.assist1),assist2:attr(c.assist2),reason:clean(c.reason,200)};
  if(c.type==='PENALTY_ASSESSED'||c.type==='PENALTY_DELAYED')payload={penaltyId:id,teamId:c.team,player:attr(c.player),servedBy:attr(c.servedBy||c.player),infraction:clean(c.infraction,80),durationSeconds:c.duration,classification:c.classification||'MINOR',coincidental:c.coincidental===true,coincidentalGroup:c.coincidentalGroup||null};
  if(c.type==='PENALTY_DELAYED_WAVED')payload={delayedEventId:clean(c.delayedEventId,80)};
  if(c.type==='PENALTY_WHISTLE')payload={delayedEventIds:Array.isArray(c.delayedEventIds)?c.delayedEventIds.map(x=>clean(x,80)):null};
  if(c.type==='SHOT_RECORDED')payload={teamId:c.team};
  if(c.type==='CLOCK_UPDATED'){seconds=c.action==='STOP'?this.currentSeconds():c.seconds;payload={action:c.action,secondsRemaining:seconds};}else if(c.type==='CLOCK_SYNCED'){seconds=c.seconds;payload={previousSeconds:this.currentSeconds(),secondsRemaining:seconds,scope:c.scope||'GAME_ONLY',reason:clean(c.reason,200)};}else if(this.state.running){seconds=this.currentSeconds();}
  if(c.type==='OVERTIME_STARTED'){period=this.timingRules.periodCount+1;seconds=this.timingRules.overtimeSeconds;payload={action:'START_OVERTIME'};}
  if(c.type==='TIMEOUT_TAKEN')payload={teamId:c.team,durationSeconds:this.timingRules.timeoutSeconds};
  if(c.type==='PERIOD_ADVANCED'){const next=nextPeriod(period,this.timingRules);period=next.period;seconds=c.seconds===undefined?next.seconds:c.seconds;}
  if(c.type==='PERIOD_ENDED'||c.type==='GAME_ENDED'){seconds=c.seconds===undefined?seconds:checkOfficial(c.seconds,this.timingRules,period);}
  checkOfficial(seconds,this.timingRules,period);
  if(c.type==='GOAL_RECORDED'&&period>this.timingRules.periodCount){payload.suddenDeath=true;}
  if(c.type==='MERCY_MODE_CHANGED')payload={active:c.active,hasTriggered:c.hasTriggered,reason:clean(c.reason,200)};
  const record={game_id:this.gameId,seq,event_id:id,idempotency_key:key,event_type:c.type,occurred_at_utc:at,actor_id:clean(actor,80),period,clock_seconds:seconds,payload_json:JSON.stringify(payload)};
  this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO game_events VALUES (?,?,?,?,?,?,?,?,?,?)').run(...Object.values(record));this.db.prepare('INSERT INTO sync_outbox(event_id,game_id,seq) VALUES(?,?,?)').run(id,this.gameId,seq);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  this.state=project(this.rows(),this.timingRules);this.clockAnchor=this.state.running?process.hrtime.bigint():null;this.audit('COMMAND_COMMITTED',{type:c.type,eventId:id,revision:seq,actor});this.repairMirror();return {eventId:id,revision:seq,duplicate:false,mirrorHealthy:this.mirrorHealthy};
 }
 close(){this.db.close();}
}
module.exports={Authority,project,validate,attr,unattr};