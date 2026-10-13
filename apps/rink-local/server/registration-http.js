'use strict';
// Dedicated scoped registrar routes. The local rink operator key is used
// ONLY for development provisioning, never to read private player records.
const {RegistrationPortal}=require('./registration-portal');
function createRegistrationHttp(dbPath,{readBody,send,bootstrapAuth}){
 const portal=new RegistrationPortal(dbPath);
 async function handle(req,res,pathname){
  if(!pathname.startsWith('/api/registration/v1/'))return false;
  const route=pathname.slice('/api/registration/v1/'.length);
  const body=()=>readBody(req);
  const reply=(code,data)=>send(res,code,data);
  try{
   if(route==='login'&&req.method==='POST'){const b=await body();reply(200,portal.login(b.email,b.password));return true;}
   if(route.startsWith('bootstrap/')&&req.method==='POST'){
    if(!bootstrapAuth(req)){reply(403,{error:'Development bootstrap credential required'});return true;}
    const b=await body();
    if(route==='bootstrap/club')reply(201,portal.createClub(b));
    else if(route==='bootstrap/team')reply(201,portal.assignTeam(b.clubId,b.teamId));
    else if(route==='bootstrap/user')reply(201,portal.createUser(b));
    else reply(404,{error:'Unknown bootstrap action'});
    return true;
   }
   if(route==='logout'&&req.method==='POST'){reply(200,portal.logout(String(req.headers.authorization||'').replace(/^Bearer /i,'')));return true;}
   const user=portal.authenticate(String(req.headers.authorization||'').replace(/^Bearer /i,''));
   if(route==='context'&&req.method==='GET'){reply(200,{role:user.role,scopeId:user.scopeId,teams:portal.teams(user)});return true;}
   if(route==='players'&&req.method==='GET'){reply(200,{players:portal.players(user)});return true;}
   if(route==='players'&&req.method==='POST'){reply(201,portal.createPlayer(user,await body()));return true;}
   const player=route.match(/^players\/([-\w]+)$/);
   if(player&&req.method==='GET'){reply(200,portal.profile(user,player[1]));return true;}
   if(player&&req.method==='PUT'){reply(200,portal.updateProfile(user,player[1],await body()));return true;}
   const related=route.match(/^players\/([-\w]+)\/related-people$/);
   if(related&&req.method==='POST'){reply(201,portal.addRelatedPerson(user,related[1],await body()));return true;}
   if(route==='requests'&&req.method==='GET'){reply(200,{requests:portal.requests(user)});return true;}
   if(route==='requests'&&req.method==='POST'){reply(201,portal.submit(user,await body()));return true;}
   if(route==='rollover/preview'&&req.method==='POST'){reply(200,{rows:portal.rolloverPreview(user,await body())});return true;}
   if(route==='imports/preview'&&req.method==='POST'){const b=await body();reply(200,{rows:portal.preview(user,b.rows)});return true;}
   if(route==='imports/submit'&&req.method==='POST'){const b=await body();reply(201,{submitted:portal.submitBatch(user,b.rows)});return true;}
   const decision=route.match(/^requests\/([-\w]+)\/decision$/);
   if(decision&&req.method==='POST'){reply(200,portal.decide(user,decision[1],await body()));return true;}
   const link=route.match(/^clubs\/([-\w]+)\/players$/);
   if(link&&req.method==='POST'){const b=await body();reply(201,portal.linkExisting(user,link[1],b.playerId));return true;}
   if(link&&req.method==='DELETE'){const b=await body();reply(200,portal.unlinkExisting(user,link[1],b.playerId,b.reason));return true;}
   if(route==='training/requirements'&&req.method==='POST'){
    const b=await body();portal.requireLeague(user,b.leagueId);
    reply(201,portal.registry.requireTraining(b,user.id));return true;
   }
   if(route==='training/completions'&&req.method==='POST'){
    const b=await body();const reqRow=portal.db.prepare('SELECT league_id FROM season_training_requirements WHERE id=?').get(b.requirementId);
    if(!reqRow)throw Error('Unknown training requirement');
    portal.requireLeague(user,reqRow.league_id);
    if(!portal.canRead(user,b.playerId))throw Error('Player outside league scope');
    reply(201,portal.registry.recordTraining(b,user.id));return true;
   }
   if(route==='training/status'&&req.method==='GET'){
    const url=new URL(req.url,'http://localhost'),playerId=url.searchParams.get('playerId'),teamId=url.searchParams.get('teamId'),date=url.searchParams.get('date');
    if(!portal.canRead(user,playerId))throw Error('Player outside authorized scope');
    const team=portal.team(teamId);
    if(user.role==='LEAGUE_ADMIN')portal.requireLeague(user,team.leagueId);
    else if(!portal.db.prepare('SELECT 1 FROM registration_club_teams WHERE club_id=? AND team_id=?').get(user.scopeId,teamId))throw Error('Team outside club scope');
    reply(200,{status:portal.registry.trainingStatus(playerId,teamId,date)});return true;
   }
   reply(404,{error:'Unknown registration endpoint'});return true;
  }catch(error){
   const msg=String(error.message||'Request failed');
   const forbidden=/access denied|outside.*scope|sign-in|required|administrator|registrar/i.test(msg);
   reply(forbidden?403:400,{error:msg.slice(0,250)});return true;
  }
 }
 return {handle,close:()=>portal.close(),portal};
}
module.exports={createRegistrationHttp};
