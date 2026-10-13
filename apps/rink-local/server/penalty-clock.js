'use strict';
// Pure, replayable game-clock penalty projection. All times are game seconds.
// League-specific adjudication remains subject to a versioned ruleset.
const DEFAULT_RULES=Object.freeze({skaters:5,minimumSkaters:3,minorSeconds:120,majorSeconds:300,
  doubleMinorSegmentSeconds:120,terminateMinorOnPowerPlayGoal:true,maxPeriods:9});
const STRENGTH=new Set(['MINOR','DOUBLE_MINOR','MAJOR']);
function penaltyClock(events,currentPeriod,currentSeconds,periodSeconds=900,policy={}){
 const rules={...DEFAULT_RULES,...policy};
 if(!Number.isInteger(rules.skaters)||!Number.isInteger(rules.minimumSkaters)||rules.minimumSkaters<1||rules.minimumSkaters>rules.skaters)throw Error('Invalid ruleset');
 let period=1,seconds=periodSeconds,played=0,ordinal=0;
 const penalties=[],delayed=[];
 const isCandidate=p=>STRENGTH.has(p.classification)&&!p.coincidental;
 const other=s=>s==='home'?'away':'home';
 const concurrent=()=>rules.skaters-rules.minimumSkaters;
 const countServing=side=>penalties.filter(p=>p.team===side&&p.status==='serving'&&isCandidate(p)).length;
 function activateQueued(){for(const side of ['home','away']){
   for(const p of penalties.filter(p=>p.team===side&&p.status==='queued'&&isCandidate(p)).sort((a,b)=>a.order-b.order)){
     if(countServing(side)>=concurrent())break;
     p.status='serving';p.startedAt=played;
   }
 }}
 function tick(delta){
   // Segment-completion boundaries are processed before moving on to the next second.
   for(let k=0;k<delta;k++){
     for(const p of penalties){
       if(p.status!=='serving')continue;
       p.remaining=Math.max(0,p.remaining-1);
       if(p.remaining===0){p.status='complete';p.completedAt=played+1;}
     }
     played++;
     activateQueued();
   }
 }
 function advance(p,s,set=false){
   if(!Number.isInteger(p)||!Number.isFinite(s))return;
   if(!set){if(p===period && s<seconds)tick(Math.max(0,Math.floor(seconds-s)));
     else if(p>period)tick(Math.max(0,Math.floor(seconds)));}
   period=p;seconds=s;
 }
 const strength=()=>{const v={home:rules.skaters,away:rules.skaters};for(const side of ['home','away'])v[side]=Math.max(rules.minimumSkaters,rules.skaters-countServing(side));return v;};
 function assess(e,d){
   const classification=d.classification||'MINOR',duration=Number(d.duration);
   if(!['home','away'].includes(e.team)||!Number.isFinite(duration)||duration<=0)return;
   const p={id:e.id,team:e.team,player:d.player,servedBy:d.servedBy||d.player,infraction:d.infraction,
     classification,coincidental:d.coincidental===true,coincidentalGroup:d.coincidentalGroup||null,
     duration,remaining:duration,status:'queued',order:ordinal++,startedAt:null};
   penalties.push(p);
   if(!isCandidate(p)){p.status='serving';p.startedAt=played;}else activateQueued();
 }
 function finishSegment(p){
   if(p.classification==='DOUBLE_MINOR'&&p.remaining>rules.doubleMinorSegmentSeconds){
     p.remaining=rules.doubleMinorSegmentSeconds;
   }else {p.remaining=0;p.status='complete';p.completedAt=played;activateQueued();}
 }
 for(const e of events){
   if(!Number.isInteger(e.period)||!Number.isFinite(e.seconds))continue;
   advance(e.period,e.seconds,(e.type==='CLOCK_UPDATED'&&e.details?.action==='SET')||e.type==='CLOCK_SYNCED');
   const d=e.details||{};
   if(e.type==='CLOCK_SYNCED'&&d.scope==='GAME_AND_PENALTIES'){
     const correction=Number(d.secondsRemaining)-Number(d.previousSeconds);
     if(Number.isInteger(correction)&&Math.abs(correction)<=3600){
       if(correction<0)tick(-correction);
       else if(correction>0){
         // Restore elapsed penalty time without reassessing penalties or changing manpower slots.
         // A completed penalty cannot automatically be reactivated; that requires an official correction.
         for(const p of penalties)if(p.status==='serving')p.remaining+=correction;
       }
     }
   }
   if(e.type==='PENALTY_DELAYED'){
     if(['home','away'].includes(e.team))delayed.push({id:e.id,team:e.team,details:d});
   }else if(e.type==='PENALTY_DELAYED_WAVED'){
     const n=delayed.findIndex(p=>p.id===d.delayedEventId);if(n>=0)delayed.splice(n,1);
   }else if(e.type==='PENALTY_WHISTLE'){
     const selected=d.delayedEventIds?new Set(d.delayedEventIds):null;
     for(let i=delayed.length-1;i>=0;i--){if(!selected||selected.has(delayed[i].id)){
       const p=delayed.splice(i,1)[0];assess({id:p.id,team:p.team},p.details);
     }}
   }else if(e.type==='PENALTY_ASSESSED')assess(e,d);
   else if(e.type==='GOAL_RECORDED'&&['home','away'].includes(e.team)){
     const s=strength(),opponent=other(e.team);
     if(rules.terminateMinorOnPowerPlayGoal&&s[e.team]>s[opponent]){
       const eligible=penalties.filter(p=>p.team===opponent&&p.status==='serving'&&isCandidate(p)&&['MINOR','DOUBLE_MINOR'].includes(p.classification));
       eligible.sort((a,b)=>a.startedAt-b.startedAt||a.order-b.order);
       if(eligible[0])finishSegment(eligible[0]);
     }
   }
 }
 advance(currentPeriod,currentSeconds);
 const active=penalties.filter(p=>p.status!=='complete').map(p=>({id:p.id,team:p.team,player:p.player,servedBy:p.servedBy,
   infraction:p.infraction,classification:p.classification,duration:p.duration,coincidental:p.coincidental,
   coincidentalGroup:p.coincidentalGroup,remaining:p.remaining,countsForStrength:isCandidate(p)&&p.status==='serving',
   status:p.status}));
 const teamStrength=strength();
 return {active,delayed:delayed.map(p=>({id:p.id,team:p.team,details:p.details})),teamStrength,
   powerPlay:teamStrength.home>teamStrength.away?'home':teamStrength.away>teamStrength.home?'away':null,
   playedSeconds:played,ruleset:rules};
}
module.exports={penaltyClock,DEFAULT_RULES};