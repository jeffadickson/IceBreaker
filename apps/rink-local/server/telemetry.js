'use strict';
// Minimal, privacy-first OTel instrumentation boundary.
// No URLs, paths with identifiers, headers, request bodies, player names,
// passwords, or document contents are ever attached to spans.
const SERVICE='icebreaker.rink-local';
const ENABLED=process.env.ICEBREAKER_OTEL_ENABLED==='1';
let api=null;
if(ENABLED){
 try{api=require('@opentelemetry/api');}
 catch{throw Error('ICEBREAKER_OTEL_ENABLED requires @opentelemetry/api; install the optional observability packages');}
}
const ROUTES=[
 ['/api/operator/command','operator.command'],
 ['/api/operator/action','operator.action'],
 ['/api/scoresheet/v1/','scoresheet'],
 ['/api/registration/v1/','registration'],
 ['/api/team/v1/','team'],
 ['/api/parent/','parent'],
 ['/api/health','health'],
 ['/api/games/','games'],
];
const EVENT_TYPES=new Set([
 'GOAL_RECORDED','GOAL_ATTRIBUTION_CORRECTED','PENALTY_ASSESSED',
 'GOALIE_CHANGED','CLOCK_UPDATED','PERIOD_ENDED','PERIOD_ADVANCED',
 'OVERTIME_STARTED','TIMEOUT_TAKEN','SHOT_RECORDED'
]);
function routeFamily(pathname){
 for(const [prefix,name] of ROUTES){
  if(prefix.endsWith('/')?pathname.startsWith(prefix):pathname===prefix)return name;
 }
 return pathname.endsWith('.html')||pathname.endsWith('.js')||pathname.endsWith('.css')?'static':'other';
}
function safeEventType(value){return EVENT_TYPES.has(value)?value:'OTHER';}
function tracer(){return api?.trace.getTracer(SERVICE,'1.0.0');}
function meter(){return api?.metrics.getMeter(SERVICE,'1.0.0');}
const counters=new Map();
const histograms=new Map();
function counter(name){
 if(!api)return null;
 if(!counters.has(name))counters.set(name,meter().createCounter(name));
 return counters.get(name);
}
function histogram(name){
 if(!api)return null;
 if(!histograms.has(name))histograms.set(name,meter().createHistogram(name,{unit:'ms'}));
 return histograms.get(name);
}
function count(name,attrs={}){
 counter(name)?.add(1,attrs);
}
function withSpan(name,attributes,fn){
 if(!api)return fn();
 return tracer().startActiveSpan(name,{attributes},span=>{
  try{
   const result=fn();
   if(result&&typeof result.then==='function')return result.then(
    value=>{span.end();return value;},
    err=>{span.setStatus({code:api.SpanStatusCode.ERROR});span.end();throw err;});
   span.end();return result;
  }catch(err){span.setStatus({code:api.SpanStatusCode.ERROR});span.end();throw err;}
 });
}
function withRequest(req,res,handler){
 const pathname=(()=>{try{return new URL(req.url,'http://localhost').pathname;}catch{return '/invalid';}})();
 const family=routeFamily(pathname);
 const method=['GET','POST','PUT','DELETE','PATCH'].includes(req.method)?req.method:'OTHER';
 return withSpan('icebreaker.http.request',{ 'http.request.method':method,'icebreaker.route.family':family },async()=>{
  const start=process.hrtime.bigint();
  let finished=false;
  const finish=()=>{
   if(finished)return;finished=true;
   const status=res.statusCode;
   const group=status>=500?'5xx':status>=400?'4xx':status>=300?'3xx':'2xx';
   count('icebreaker.http.requests',{family,method,status_group:group});
   const elapsedMs=Number(process.hrtime.bigint()-start)/1e6;
   histogram('icebreaker.http.duration')?.record(elapsedMs,{family,method,status_group:group});
  };
  res.once('finish',finish);
  res.once('close',finish);
  try{return await handler();}
  catch(err){count('icebreaker.http.unhandled_errors',{family});throw err;}
 });
}
function recordGameCommand(command,execute){
 const type=safeEventType(command?.type);
 return withSpan('icebreaker.game.command',{'icebreaker.game.event_type':type},()=>{
  try{
   const result=execute();
   count('icebreaker.game.commands',{event_type:type,outcome:result?.duplicate?'duplicate':'accepted'});
   return result;
  }catch(err){
   count('icebreaker.game.commands',{event_type:type,outcome:'rejected'});
   throw err;
  }
 });
}
module.exports={ENABLED,routeFamily,safeEventType,withSpan,withRequest,recordGameCommand,count};
