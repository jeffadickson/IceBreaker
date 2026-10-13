'use strict';
// Auxiliary warm-up/intermission clock. Never advances official game/penalty clock.
const crypto=require('node:crypto');
const {validateTiming,phaseLength}=require('./game-timing-rules');
class AuxiliaryClock {
 constructor(db,gameId,timing,{now=()=>process.hrtime.bigint(),audit=()=>{}}={}){
  this.db=db;this.gameId=gameId;this.timing=validateTiming(timing);this.now=now;this.audit=audit;this.anchor=null;
  db.exec(`CREATE TABLE IF NOT EXISTS auxiliary_clock_state(game_id TEXT PRIMARY KEY,phase TEXT NOT NULL,remaining INTEGER NOT NULL,running INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS auxiliary_clock_history(game_id TEXT NOT NULL,seq INTEGER NOT NULL,event_id TEXT NOT NULL UNIQUE,action TEXT NOT NULL,phase TEXT NOT NULL,remaining INTEGER NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(game_id,seq));`);
  db.prepare("INSERT OR IGNORE INTO auxiliary_clock_state VALUES(?, 'WARMUP', ?, 0, 0)").run(gameId,this.timing.warmupSeconds);
  const row=this.row();
  if(row.running){db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE auxiliary_clock_state SET running=0,revision=revision+1 WHERE game_id=? AND revision=?').run(gameId,row.revision);db.prepare('INSERT INTO auxiliary_clock_history VALUES(?,?,?,?,?,?,?,?)').run(gameId,row.revision+1,crypto.randomUUID(),'RECOVER_PAUSED',row.phase,row.remaining,'system-recovery',new Date().toISOString());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}this.audit('AUX_TIMER_RECOVERED_PAUSED',{gameId,phase:row.phase,remaining:row.remaining});}
 }
 row(){return this.db.prepare('SELECT phase,remaining,running,revision FROM auxiliary_clock_state WHERE game_id=?').get(this.gameId);}
 currentSeconds(){const s=this.row();return s.running&&this.anchor!==null?Math.max(0,s.remaining-Math.floor(Number(this.now()-this.anchor)/1e9)):s.remaining;}
 snapshot(){const s=this.row();const remaining=this.currentSeconds();return {gameId:this.gameId,phase:s.phase,seconds:remaining,running:!!s.running&&remaining>0,revision:s.revision,maxSeconds:phaseLength(this.timing,s.phase)};}
 command({action,phase},{actor='scorekeeper',officialClockRunning=false}={}){
  if(officialClockRunning)throw Error('Stop official game clock before operating auxiliary timer');
  if(!['START','PAUSE','RESET'].includes(action))throw Error('Invalid auxiliary timer command');
  if(phase!==undefined&&!['WARMUP','INTERMISSION'].includes(phase))throw Error('Invalid auxiliary timer phase');
  const before=this.snapshot();if(action==='START'&&before.running)throw Error('Timer already running');
  if(action==='START'&&before.seconds<=0)throw Error('Reset expired timer first');
  const selected=action==='RESET'?(phase||before.phase):before.phase;
  const remaining=action==='RESET'?phaseLength(this.timing,selected):before.seconds;
  const running=action==='START'?1:0;
  const event={gameId:this.gameId,action,phase:selected,remaining,actor:String(actor).slice(0,80),eventId:crypto.randomUUID(),at:new Date().toISOString()};
  this.db.exec('BEGIN IMMEDIATE');try{
    const result=this.db.prepare('UPDATE auxiliary_clock_state SET phase=?,remaining=?,running=?,revision=revision+1 WHERE game_id=? AND revision=?').run(selected,remaining,running,this.gameId,before.revision);
    if(result.changes!==1)throw Error('Auxiliary timer revision conflict');
    this.db.prepare('INSERT INTO auxiliary_clock_history VALUES(?,?,?,?,?,?,?,?)').run(this.gameId,before.revision+1,event.eventId,action,selected,remaining,event.actor,event.at);
    this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
  this.anchor=running?this.now():null;
  this.audit('AUX_TIMER_'+action,event);
  return this.snapshot();
 }
}
module.exports={AuxiliaryClock};
