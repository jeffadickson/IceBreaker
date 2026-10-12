/* Icebreaker parent tracker read model. Browser global + Node CommonJS. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.IcebreakerTracker=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const DISPLAY_TYPES=new Set(['GOAL_RECORDED','PENALTY_ASSESSED','GOAL_ATTRIBUTION_CORRECTED','GOAL_VOIDED','PERIOD_ENDED','PERIOD_ADVANCED','GAME_ENDED']);
const cleanNumber=x=>Number.isInteger(x)&&x>=0?x:0;
function safeText(x){return String(x??'').replace(/[<>]/g,'');}
function scoreView(scores,mercy){let home=cleanNumber(scores?.home),away=cleanNumber(scores?.away);if(mercy?.enabled&&mercy?.cap>0&&(mercy?.triggered||Math.abs(home-away)>=mercy.threshold)){const cap=mercy.cap;if(home>away)home=Math.min(home,away+cap);else away=Math.min(away,home+cap);}return {home,away};}
function eventFeed(events){const items=[],byId=new Map(),seen=new Set();for(const e of events||[]){if(!e||!e.id||seen.has(e.id))continue;seen.add(e.id);if(!DISPLAY_TYPES.has(e.type))continue;const d=e.details||{};if(e.type==='GOAL_ATTRIBUTION_CORRECTED'){const target=byId.get(d.originalEventId);if(target){target.scorer=safeText(d.scorer);target.assist1=safeText(d.assist1);target.assist2=safeText(d.assist2);target.corrected=true;}else items.push({id:e.id,type:'CORRECTION',team:e.team,period:e.period,seconds:e.seconds,reference:d.originalEventId,label:'Goal attribution corrected'});continue;}
if(e.type==='GOAL_VOIDED'){const target=byId.get(d.originalEventId);if(target){target.voided=true;target.corrected=true;}else items.push({id:e.id,type:'CORRECTION',team:e.team,period:e.period,seconds:e.seconds,label:'Goal rescinded'});continue;}
const item={id:e.id,type:e.type,team:e.team,period:cleanNumber(e.period),seconds:cleanNumber(e.seconds),at:e.at};if(e.type==='GOAL_RECORDED'){item.scorer=safeText(d.scorer||'TBD');item.assist1=safeText(d.assist1||'TBD');item.assist2=safeText(d.assist2||'TBD');byId.set(e.id,item);}else if(e.type==='PENALTY_ASSESSED'){item.player=safeText(d.player||'TBD');item.infraction=safeText(d.infraction||'Penalty');item.duration=cleanNumber(d.duration);}items.push(item);}
return items.reverse();}
function project(snapshot){const s=snapshot||{},scores={home:cleanNumber(s.scores?.home),away:cleanNumber(s.scores?.away)},feed=eventFeed(s.events);return {period:cleanNumber(s.period),seconds:cleanNumber(s.seconds),running:!!s.running,home:scores.home,away:scores.away,feed,revision:cleanNumber(s.revision),connected:!!s.connected};}
return {scoreView,eventFeed,project,DISPLAY_TYPES};
});
