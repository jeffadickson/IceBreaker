'use strict';
// Contract exercise / sample module; NOT a production soccer rules engine.
const EVENTS=new Set(['GOAL_RECORDED','SHOT_RECORDED','CLOCK_UPDATED','PERIOD_ENDED','PERIOD_ADVANCED','GAME_ENDED','CARD_ISSUED']);
const soccer={id:'soccer',version:1,
 describe(){return {id:this.id,version:this.version,label:'Soccer (contract example)',periodLabel:'Half',capabilities:['shots','cards','goal-assists']};},
 validateEvent(e){if(!EVENTS.has(e.type))throw Error('Unsupported soccer event: '+e.type);if(['GOAL_RECORDED','SHOT_RECORDED','CARD_ISSUED'].includes(e.type)&&!['home','away'].includes(e.team))throw Error('Invalid team');},
 project(events){const scores={home:0,away:0},shots={home:0,away:0},cards={home:0,away:0};let period=1,seconds=0,ended=false;const timeline=[];
   for(const e of events){period=e.period??period;seconds=e.seconds??seconds;if(e.type==='GOAL_RECORDED'){scores[e.team]++;shots[e.team]++;}if(e.type==='SHOT_RECORDED')shots[e.team]++;if(e.type==='CARD_ISSUED')cards[e.team]++;if(e.type==='GAME_ENDED')ended=true;timeline.push({id:e.id,type:e.type,team:e.team??null,period,seconds});}
   return {scores,shots,cards,period,seconds,ended,timeline};
 }};
module.exports={soccer};