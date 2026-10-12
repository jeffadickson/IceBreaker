'use strict';
// Icebreaker development-only spectator gateway. No official-game authority.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {URL}=require('node:url');
const root=path.resolve(__dirname,'../web');
const port=Number(process.env.PORT||8080);
const host=process.env.HOST||'127.0.0.1';
const key=process.env.ICEBREAKER_OPERATOR_KEY||'dev-only-change-me';
const journal=process.env.ICEBREAKER_DEMO_JOURNAL||path.join(__dirname,'demo-events.jsonl');
const clients=new Set();
const names={home:'Pasadena Maple Leafs',away:'Santa Clarita Flyers'};
const initial=()=>({revision:0,period:1,seconds:900,running:false,scores:{home:0,away:0},mercy:{enabled:true,threshold:5,cap:5,triggered:false},events:[]});
let state=initial();
function clean(x,max=80){return String(x??'').replace(/[<>\u0000-\u001f]/g,'').slice(0,max);}
function validSide(x){return x==='home'||x==='away';}
function validAttr(x){return x==='TBD'||x==='None'||/^\d{1,3}$/.test(String(x));}
function publicScore(scores,mercy){let {home,away}=scores;if(mercy.enabled&&(mercy.triggered||Math.abs(home-away)>=mercy.threshold)){if(home>away)home=Math.min(home,away+mercy.cap);else away=Math.min(away,home+mercy.cap);}return {home,away};}
function safeEvent(e){const base={id:e.id,type:e.type,team:e.team,period:e.period,seconds:e.seconds,at:e.at};const d=e.details||{};
 if(e.type==='GOAL_RECORDED')base.details={scorer:d.scorer,assist1:d.assist1,assist2:d.assist2};
 else if(e.type==='GOAL_ATTRIBUTION_CORRECTED'||e.type==='GOAL_VOIDED')base.details={originalEventId:d.originalEventId,scorer:d.scorer,assist1:d.assist1,assist2:d.assist2};
 else if(e.type==='PENALTY_ASSESSED')base.details={player:d.player,infraction:d.infraction,duration:d.duration};
 else base.details={};return base;
}
// Live tracker intentionally shows the FULL official score. Only physical/arena
// scoreboard projections may apply mercy display rules.
function spectatorSnapshot(){return {revision:state.revision,period:state.period,seconds:state.seconds,running:state.running,scores:{...state.scores},events:state.events.map(safeEvent),teams:names,connected:true,scorePolicy:'FULL_OFFICIAL'};}
function arenaScoreboardSnapshot(){return {revision:state.revision,period:state.period,seconds:state.seconds,running:state.running,scores:publicScore(state.scores,state.mercy),scorePolicy:'MERCY_DISPLAY_CAP',teams:names};}
function validate(cmd){if(!cmd||typeof cmd!=='object')throw Error('Invalid command');const type=cmd.type;
 if(type==='GOAL_RECORDED'){if(!validSide(cmd.team)||!validAttr(cmd.scorer)||cmd.scorer==='None'||!validAttr(cmd.assist1)||!validAttr(cmd.assist2))throw Error('Invalid goal attribution');if([cmd.scorer,cmd.assist1,cmd.assist2].filter(x=>x!=='TBD'&&x!=='None').length!==new Set([cmd.scorer,cmd.assist1,cmd.assist2].filter(x=>x!=='TBD'&&x!=='None')).size)throw Error('Duplicate player attribution');}
 else if(type==='PENALTY_ASSESSED'){if(!validSide(cmd.team)||!validAttr(cmd.player)||cmd.player==='None'||!clean(cmd.infraction)||!Number.isInteger(cmd.duration)||cmd.duration<0||cmd.duration>3600)throw Error('Invalid penalty');}
 else if(type==='GOAL_ATTRIBUTION_CORRECTED'){if(!state.events.some(e=>e.id===cmd.originalEventId&&e.type==='GOAL_RECORDED')||!validAttr(cmd.scorer)||cmd.scorer==='None'||!validAttr(cmd.assist1)||!validAttr(cmd.assist2))throw Error('Invalid correction');}
 else if(type==='PERIOD_ENDED'||type==='PERIOD_ADVANCED'||type==='GAME_ENDED'){}
 else if(type==='CLOCK_SET'){if(!Number.isInteger(cmd.seconds)||cmd.seconds<0||cmd.seconds>3600)throw Error('Invalid clock');}
 else throw Error('Unsupported command');}
function apply(cmd,{replay=false}={}){validate(cmd);const type=cmd.type;let e=null;
 if(type==='CLOCK_SET'){state.seconds=cmd.seconds;}
 else {e={id:replay?cmd.id:crypto.randomUUID(),type,team:cmd.team||null,period:state.period,seconds:state.seconds,at:replay?cmd.at:new Date().toISOString(),details:{}};
 if(type==='GOAL_RECORDED'){e.details={scorer:cmd.scorer,assist1:cmd.assist1,assist2:cmd.assist2};state.scores[cmd.team]++;if(Math.abs(state.scores.home-state.scores.away)>=state.mercy.threshold)state.mercy.triggered=true;}
 if(type==='PENALTY_ASSESSED')e.details={player:cmd.player,infraction:clean(cmd.infraction,60),duration:cmd.duration};
 if(type==='GOAL_ATTRIBUTION_CORRECTED')e.details={originalEventId:cmd.originalEventId,scorer:cmd.scorer,assist1:cmd.assist1,assist2:cmd.assist2};
 if(type==='PERIOD_ADVANCED'){state.period=Math.min(9,state.period+1);state.seconds=900;}
 if(type==='PERIOD_ENDED'||type==='GAME_ENDED')state.running=false;
 state.events.push(e);}
 state.revision++;return e;
}
function readJournal(){if(!fs.existsSync(journal))return;for(const line of fs.readFileSync(journal,'utf8').split('\n')){if(!line.trim())continue;const cmd=JSON.parse(line);apply(cmd,{replay:true});}}
readJournal();
function push(){const data=`id: ${state.revision}\nevent: snapshot\ndata: ${JSON.stringify(spectatorSnapshot())}\n\n`;for(const res of clients){try{res.write(data);}catch{clients.delete(res);}}}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
function send(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
const server=http.createServer(async(req,res)=>{let u;try{u=new URL(req.url,'http://localhost');}catch{return send(res,400,{error:'Invalid URL'});}const pathname=u.pathname;
 if(req.method==='GET'&&pathname==='/api/games/demo/snapshot')return send(res,200,spectatorSnapshot());
 if(req.method==='GET'&&pathname==='/api/games/demo/arena-scoreboard')return send(res,200,arenaScoreboardSnapshot());
 if(req.method==='GET'&&pathname==='/api/games/demo/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});clients.add(res);res.write(`retry: 1500\n\n`);res.write(`id: ${state.revision}\nevent: snapshot\ndata: ${JSON.stringify(spectatorSnapshot())}\n\n`);req.on('close',()=>clients.delete(res));return;
 }
 if(req.method==='POST'&&pathname==='/api/operator/command'){
  if(host!=='127.0.0.1'&&host!=='localhost')return send(res,403,{error:'Operator endpoint restricted to loopback demo server'});
  const provided=req.headers['x-demo-operator-key'];if(typeof provided!=='string'||provided.length!==key.length||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(key)))return send(res,403,{error:'Operator key required'});
  let body='';try{for await(const chunk of req){body+=chunk;if(body.length>10000)throw Error('Too large');}const cmd=JSON.parse(body);validate(cmd);const record={...cmd,id:crypto.randomUUID(),at:new Date().toISOString()};fs.mkdirSync(path.dirname(journal),{recursive:true});fs.appendFileSync(journal,JSON.stringify(record)+'\n',{encoding:'utf8',flag:'a'});const e=apply(record,{replay:true});push();return send(res,200,{revision:state.revision,eventId:e?.id||null});}catch(err){return send(res,400,{error:err.message});}
 }
 if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
 const file=path.resolve(root,'.'+(pathname==='/'?'/live.html':pathname));if(!file.startsWith(root+path.sep))return send(res,403,{error:'Forbidden'});
 try{const data=fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(data);}catch{return send(res,404,{error:'Not found'});}
});
if(require.main===module)server.listen(port,host,()=>console.log(`Icebreaker live demo: http://${host}:${port}/live.html`));
module.exports={server,apply,initial,publicScore,spectatorSnapshot,arenaScoreboardSnapshot,validate};
