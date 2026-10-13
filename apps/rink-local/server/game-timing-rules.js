'use strict';
// Sport timing policy: immutable per game once play begins. Units are seconds.
const DEFAULT_TIMING=Object.freeze({periodCount:3,periodSeconds:900,warmupSeconds:300,intermissionSeconds:120,overtimeSeconds:0});
function validateTiming(input={}){
 if(input===null||Array.isArray(input)||typeof input!=='object')throw Error('Invalid timing rules');
 const v={...DEFAULT_TIMING,...input};
 for(const [k,lo,hi] of [['periodCount',1,9],['periodSeconds',60,3600],['warmupSeconds',0,3600],['intermissionSeconds',0,3600],['overtimeSeconds',0,3600]]){
  if(!Number.isInteger(v[k])||v[k]<lo||v[k]>hi)throw Error('Invalid timing rule '+k);
 }
 return Object.freeze(v);
}
function phaseLength(timing,phase){const r=validateTiming(timing);if(phase==='WARMUP')return r.warmupSeconds;if(phase==='INTERMISSION')return r.intermissionSeconds;if(phase==='PERIOD')return r.periodSeconds;if(phase==='OVERTIME')return r.overtimeSeconds;throw Error('Unknown clock phase');}
function verifyTime(seconds,timing,phase='PERIOD'){const max=phaseLength(timing,phase);if(!Number.isInteger(seconds)||seconds<0||seconds>max)throw Error('Clock outside '+phase+' time limits 0..'+max);return seconds;}
function nextPeriod(period,timing){const r=validateTiming(timing);if(!Number.isInteger(period)||period<1||period>=r.periodCount)throw Error('No additional regulation period');return {period:period+1,seconds:r.periodSeconds};}
module.exports={DEFAULT_TIMING,validateTiming,phaseLength,verifyTime,nextPeriod};
