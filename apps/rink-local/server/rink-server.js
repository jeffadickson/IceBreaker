'use strict';
// Local-first development backend, not a public internet service.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {URL}=require('node:url');const {reportFromState,renderReport,topPenalties}=require('./game-report');const {createParentAuth}=require('./parent-auth');const {Authority}=require('./authority-sqlite');const {LeagueStore}=require('./league-store');const {TeamAccounts}=require('./team-accounts');
function createRinkServer({dbPath=path.join(__dirname,'../data/demo.db'),host='127.0.0.1',port=8090,operatorKey=process.env.ICEBREAKER_OPERATOR_KEY||'local-development-key'}={}){
 const parentAuth=createParentAuth({dbPath});const authority=new Authority({dbPath});const leagueStore=new LeagueStore(dbPath,{seedDemo:true});const teamAccounts=new TeamAccounts(dbPath);const clients=new Set();const root=path.resolve(__dirname,'../web');
 const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
 const broadcast=()=>{const msg=`id: ${authority.state.revision}\nevent: snapshot\ndata: ${JSON.stringify(authority.spectator())}\n\n`;for(const r of clients){try{r.write(msg);}catch{clients.delete(r);}}};
 const auth=req=>{const k=req.headers['x-operator-key'];return typeof k==='string'&&k.length===operatorKey.length&&crypto.timingSafeEqual(Buffer.from(k),Buffer.from(operatorKey));};
 async function readBody(req){let body='';for await(const chunk of req){body+=chunk;if(body.length>16_384)throw Error('Request too large');}return JSON.parse(body);}
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
 const ticker=setInterval(()=>{if(authority.state.running)broadcast();},1000);ticker.unref();
 const server=http.createServer(async(req,res)=>{let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{return send(res,400,{error:'Bad URL'});}
  if(pathname.startsWith('/api/parent/'))return parentAuth.handle(req,res,pathname,new URL(req.url,'http://localhost'));
  if(pathname==='/api/team/v1/login'&&req.method==='POST'){try{const b=await readBody(req);return send(res,200,teamAccounts.login(b.email,b.password));}catch(e){return send(res,401,{error:e.message});}}
  if(pathname==='/api/team/v1/admin/accounts'&&req.method==='POST'){if(!auth(req))return send(res,403,{error:'League administrator credential required'});try{const b=await readBody(req);return send(res,201,teamAccounts.createUser(b.email,b.password,b.teamId,b.role));}catch(e){return send(res,400,{error:e.message});}}
  const teamRoute=pathname.match(/^\/api\/team\/v1\/teams\/([-\w]+)(?:\/games\/([-\w]+)\/lineup|\/roster)?$/);
  if(teamRoute){const teamId=teamRoute[1],gameId=teamRoute[2],bearer=String(req.headers.authorization||'').replace(/^Bearer /i,'');try{
   const user=teamAccounts.authenticate(bearer,teamId,req.method!=='GET');
   if(req.method==='GET'&&gameId)return send(res,200,teamAccounts.getLineup(teamId,gameId));
   if(req.method==='GET')return send(res,200,{teamId,revision:teamAccounts.currentRevision(teamId),players:teamAccounts.roster(teamId)});
   if(req.method==='PUT'&&gameId)return send(res,200,teamAccounts.confirmLineup(teamId,gameId,user.user_id,await readBody(req)));
   if(req.method==='PUT')return send(res,200,teamAccounts.editRoster(teamId,user.user_id,await readBody(req)));
   return send(res,405,{error:'Method not allowed'});
  }catch(e){return send(res,/login|required|authorized|forbidden/i.test(e.message)?403:400,{error:e.message});}}
  if(req.method==='GET'&&pathname==='/api/league/v1/overview')return send(res,200,leagueStore.snapshot(authority));
  if(req.method==='GET'&&pathname==='/api/league/v1/audit')return send(res,403,{error:'Administrative audit is not public'});
  if(req.method==='POST'&&pathname==='/api/league/v1/games'){if(!auth(req))return send(res,403,{error:'Operator credential required'});try{return send(res,201,leagueStore.createGame(await readBody(req),{actor:req.headers['x-operator-id']||'league-admin'}));}catch(e){return send(res,400,{error:e.message});}}
  const certifyMatch=pathname.match(/^\/api\/league\/v1\/games\/([-\w]+)\/certify$/);
  if(req.method==='POST'&&certifyMatch){if(!auth(req))return send(res,403,{error:'Operator credential required'});try{return send(res,200,leagueStore.certifyGame(certifyMatch[1],{...await readBody(req),actor:req.headers['x-operator-id']||'league-admin'}));}catch(e){return send(res,400,{error:e.message});}}
  if(req.method==='GET'&&pathname==='/api/league/v1/penalty-frequency')return send(res,200,topPenalties(authority.db));
  if(req.method==='GET'&&pathname==='/api/games/demo/unofficial-report.json')return send(res,200,reportFromState(authority.state));
  if(req.method==='GET'&&pathname==='/api/games/demo/unofficial-report'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"});return res.end(renderReport(reportFromState(authority.state)));}
  if(req.method==='GET'&&pathname==='/api/health')return send(res,200,{status:'ok',revision:authority.state.revision,mirrorHealthy:authority.mirrorHealthy});
  if(req.method==='GET'&&pathname==='/api/games/demo/snapshot')return send(res,200,authority.spectator());
  if(req.method==='GET'&&pathname==='/api/games/demo/arena-scoreboard')return send(res,200,authority.arena());
  if(req.method==='GET'&&pathname==='/api/games/demo/events'){res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'});clients.add(res);res.write('retry: 1500\n\n');res.write(`id: ${authority.state.revision}\nevent: snapshot\ndata: ${JSON.stringify(authority.spectator())}\n\n`);req.on('close',()=>clients.delete(res));return;}
  if(req.method==='POST'&&pathname==='/api/operator/command'){
   if(!auth(req)){authority.audit('COMMAND_REJECTED',{reason:'unauthorized'});return send(res,403,{error:'Operator credential required'});}
   try{const cmd=await readBody(req);const result=authority.command(cmd,{actor:req.headers['x-operator-id']||'scorekeeper',key:req.headers['idempotency-key']});if(!result.duplicate)broadcast();return send(res,200,result);}catch(e){authority.audit('COMMAND_REJECTED',{reason:e.message});return send(res,400,{error:e.message});}
  }
  if(req.method==='POST'&&pathname==='/api/operator/action'){
   if(!auth(req))return send(res,403,{error:'Operator credential required'});
   try{const a=await readBody(req);if(typeof a.action!=='string'||!/^([A-Z][A-Z0-9_]{1,63})$/.test(a.action))throw Error('Invalid action');authority.audit(a.action,{context:String(a.context??'').slice(0,150),actor:String(req.headers['x-operator-id']||'scorekeeper').slice(0,80)});return send(res,200,{logged:true});}catch(e){return send(res,400,{error:e.message});}
  }
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
  const file=path.resolve(root,'.'+(pathname==='/'?'/operator.html':pathname));if(!file.startsWith(root+path.sep))return send(res,403,{error:'Forbidden'});
  try{const data=fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(data);}catch{return send(res,404,{error:'Not found'});}
 });
 return {server,authority,start:()=>new Promise(resolve=>server.listen(port,host,()=>resolve(server.address()))),stop:()=>new Promise(resolve=>{clearInterval(ticker);for(const c of clients)c.end();server.close(()=>{authority.close();leagueStore.close();teamAccounts.close();parentAuth.close();resolve();});})};
}
if(require.main===module){const app=createRinkServer({dbPath:process.env.ICEBREAKER_DB||path.join(__dirname,'../data/demo.db'),host:process.env.HOST||'127.0.0.1',port:Number(process.env.PORT||8090)});app.start().then(a=>console.log(`Icebreaker backend: http://127.0.0.1:${a.port}/operator.html\nParent view: http://127.0.0.1:${a.port}/live.html`));}
module.exports={createRinkServer};
