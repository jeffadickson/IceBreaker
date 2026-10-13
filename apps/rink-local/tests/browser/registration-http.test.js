'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createRinkServer}=require('../../server/rink-server');
test('registration web API enforces distinct club/league roles, private profile and approval workflow',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-registration-http-'));
 const app=createRinkServer({dbPath:path.join(dir,'game.db'),port:0,operatorKey:'development-bootstrap-only'});
 const port=(await app.start()).port,base='http://127.0.0.1:'+port+'/api/registration/v1/';
 t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
 async function call(route,method='GET',body,token,bootstrap=false){
  const response=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(bootstrap?{'X-Operator-Key':'development-bootstrap-only'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
 }
 assert.equal((await call('bootstrap/club','POST',{id:'club-x',name:'Club X',leagueId:'demo-league'})).status,403);
 assert.equal((await call('bootstrap/club','POST',{id:'club-x',name:'Club X',leagueId:'demo-league'},null,true)).status,201);
 assert.equal((await call('bootstrap/team','POST',{clubId:'club-x',teamId:'maple'},null,true)).status,201);
 assert.equal((await call('bootstrap/user','POST',{email:'registrar@example.invalid',password:'registrar-long-secret',role:'CLUB_REGISTRAR',scopeId:'club-x'},null,true)).status,201);
 assert.equal((await call('bootstrap/user','POST',{email:'league@example.invalid',password:'league-long-secret',role:'LEAGUE_ADMIN',scopeId:'demo-league'},null,true)).status,201);
 const club=(await call('login','POST',{email:'registrar@example.invalid',password:'registrar-long-secret'})).data.token;
 const league=(await call('login','POST',{email:'league@example.invalid',password:'league-long-secret'})).data.token;
 assert.equal((await call('players')).status,403);
 const create=await call('players','POST',{displayName:'Private Alias',legalName:'Fictional Minor',birthDate:'2016-05-01',address:{city:'Fictionville'}},club);
 assert.equal(create.status,201);
 const playerId=create.data.playerId;
 assert.equal((await call('players/'+playerId,'GET',null,club)).data.profile.birthDate,'2016-05-01');
 assert.equal((await call('players/'+playerId,'PUT',{legalName:'Fictional Minor',birthDate:'2016-05-01',address:{city:'Fiction City'}},league)).status,403);
 assert.equal((await call('players/'+playerId+'/related-people','POST',{fullName:'Fictional Parent',relationship:'PARENT'},club)).status,201);
 const preview=await call('imports/preview','POST',{rows:[{playerId,teamId:'maple',jersey:29,position:'G'}]},club);
 assert.equal(preview.data.rows[0].valid,true);
 const submitted=await call('requests','POST',{playerId,teamId:'maple',jersey:29,position:'G'},club);
 assert.equal(submitted.status,201);
 assert.equal((await call('requests/'+submitted.data.requestId+'/decision','POST',{decision:'APPROVED',reason:'Self'},club)).status,403);
 const approved=await call('requests/'+submitted.data.requestId+'/decision','POST',{decision:'APPROVED',reason:'Approved registration'},league);
 assert.equal(approved.status,200);
 assert.equal((await call('requests','GET',null,club)).data.requests[0].status,'APPROVED');
 assert.equal((await call('players','GET',null,league)).data.players[0].id,playerId);
 assert.equal(JSON.stringify(await call('context','GET',null,club)).includes('Fiction City'),false);
});
