'use strict';
const HOCKEY_EVENTS=new Set(['GOAL_RECORDED','GOAL_ATTRIBUTION_CORRECTED','PENALTY_ASSESSED','PENALTY_DELAYED','PENALTY_WHISTLE','PENALTY_DELAYED_WAVED','SHOT_RECORDED','CLOCK_UPDATED','PERIOD_ENDED','PERIOD_ADVANCED','GAME_ENDED','MERCY_MODE_CHANGED']);
const hockey={
 id:'hockey',version:1,
 describe(){return {id:this.id,version:this.version,label:'Ice Hockey',periodLabel:'Period',capabilities:['shots','penalties','power-play','mercy','goal-assists','running-clock']};},
 validateEvent(e){if(!HOCKEY_EVENTS.has(e.type))throw Error('Unsupported hockey event: '+e.type);if((e.type==='GOAL_RECORDED'||e.type==='SHOT_RECORDED')&&!['home','away'].includes(e.team))throw Error('Invalid team');},
 project(events){
   const scores={home:0,away:0},shots={home:0,away:0};let period=1,seconds=900,ended=false;
   const timeline=[];
   for(const e of events){period=e.period??period;seconds=e.seconds??seconds;
     if(e.type==='GOAL_RECORDED'){scores[e.team]++;shots[e.team]++;}
     if(e.type==='SHOT_RECORDED')shots[e.team]++;
     if(e.type==='GAME_ENDED')ended=true;
     timeline.push({id:e.id,type:e.type,team:e.team??null,period,seconds});
   }
   return {scores,shots,period,seconds,ended,timeline};
 }
};
module.exports={hockey};