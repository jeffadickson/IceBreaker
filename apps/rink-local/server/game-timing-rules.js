'use strict';
// Versioned division timing policy. All clock values are integer seconds.
// Default values preserve existing league configurations and event journals.
const DEFAULT_TIMING=Object.freeze({periodCount:3,periodSeconds:900,warmupSeconds:300,intermissionSeconds:120,overtimeSeconds:0,clockMode:'STOP',showAuxiliaryClock:true,periodLengths:null,timeoutSeconds:0,timeoutsPerTeam:0,mercyRunningDifferential:0});
function validateTiming(input={}){
 if(input===null||Array.isArray(input)||typeof input!=='object')throw Error('Invalid timing rules');
 const v={...DEFAULT_TIMING,...input};
 for(const [k,lo,hi] of [['periodCount',1,9],['periodSeconds',60,3600],['warmupSeconds',0,3600],['intermissionSeconds',0,3600],['overtimeSeconds',0,3600],['timeoutSeconds',0,600],['timeoutsPerTeam',0,9],['mercyRunningDifferential',0,99]]){
  if(!Number.isInteger(v[k])||v[k]<lo||v[k]>hi)throw Error('Invalid timing rule '+k);
 }
 if(!['STOP','RUNNING','HYBRID'].includes(v.clockMode))throw Error('Invalid timing rule clockMode');
 if(typeof v.showAuxiliaryClock!=='boolean')throw Error('Invalid timing rule showAuxiliaryClock');
 if(v.periodLengths!==null){
  if(!Array.isArray(v.periodLengths)||v.periodLengths.length!==v.periodCount||v.periodLengths.some(x=>!Number.isInteger(x)||x<60||x>3600))throw Error('Invalid timing rule periodLengths');
  v.periodLengths=Object.freeze([...v.periodLengths]);
 }
 return Object.freeze(v);
}
function periodLength(timing,period=1){const r=validateTiming(timing);if(!Number.isInteger(period)||period<1||period>r.periodCount)throw Error('Invalid regulation period');return r.periodLengths?r.periodLengths[period-1]:r.periodSeconds;}
function phaseLength(timing,phase,period=1){const r=validateTiming(timing);if(phase==='WARMUP')return r.warmupSeconds;if(phase==='INTERMISSION')return r.intermissionSeconds;if(phase==='PERIOD')return periodLength(r,period);if(phase==='OVERTIME')return r.overtimeSeconds;if(phase==='TIMEOUT')return r.timeoutSeconds;throw Error('Unknown clock phase');}
function verifyTime(seconds,timing,phase='PERIOD',period=1){const max=phaseLength(timing,phase,period);if(!Number.isInteger(seconds)||seconds<0||seconds>max)throw Error('Clock outside '+phase+' time limits 0..'+max);return seconds;}
function nextPeriod(period,timing){const r=validateTiming(timing);if(!Number.isInteger(period)||period<1||period>=r.periodCount)throw Error('No additional regulation period');return {period:period+1,seconds:periodLength(r,period+1)};}
module.exports={DEFAULT_TIMING,validateTiming,phaseLength,periodLength,verifyTime,nextPeriod};
