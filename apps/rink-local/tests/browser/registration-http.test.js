'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createRinkServer}=require('../../server/rink-server');
const {code}=require('../../server/mfa-totp');
const crypto=require('node:crypto');
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
 const managerRoster=await fetch('http://127.0.0.1:'+port+'/api/team/v1/teams/maple/roster');
 assert.equal(managerRoster.status,403);
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
 assert.equal((await call('logout','POST',null,club)).status,200);
 assert.equal((await call('context','GET',null,club)).status,403);
});


test('HTTP administrator MFA enrollment requires encrypted seed and fresh one-time login code',async t=>{
 const previous=process.env.ICEBREAKER_PRIVATE_FIELD_KEY_BASE64;
 process.env.ICEBREAKER_PRIVATE_FIELD_KEY_BASE64=crypto.randomBytes(32).toString('base64');
 t.after(()=>{if(previous===undefined)delete process.env.ICEBREAKER_PRIVATE_FIELD_KEY_BASE64;else process.env.ICEBREAKER_PRIVATE_FIELD_KEY_BASE64=previous;});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-mfa-http-'));
 const app=createRinkServer({dbPath:path.join(dir,'game.db'),port:0,operatorKey:'dev-mfa-bootstrap'});
 const port=(await app.start()).port,base='http://127.0.0.1:'+port+'/api/registration/v1/';
 t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
 async function call(route,body,token,bootstrap=false){
  const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(bootstrap?{'X-Operator-Key':'dev-mfa-bootstrap'}:{})},body:JSON.stringify(body||{})});
  return {status:r.status,data:await r.json()};
 }
 assert.equal((await call('bootstrap/user',{email:'mfa@example.invalid',password:'fake-very-long-password',role:'LEAGUE_ADMIN',scopeId:'demo-league'},null,true)).status,201);
 const first=await call('login',{email:'mfa@example.invalid',password:'fake-very-long-password'});
 assert.equal(first.status,200);
 const setup=await call('mfa/setup',{},first.data.token);
 assert.equal(setup.status,200);
 assert.equal(setup.data.secret.length,32);
 const step=Math.floor(Date.now()/30000);
 assert.equal((await call('mfa/confirm',{code:code(setup.data.secret,step)},first.data.token)).status,200);
 assert.equal((await call('mfa/setup',{},first.data.token)).status,403);
 assert.notEqual((await call('login',{email:'mfa@example.invalid',password:'fake-very-long-password'})).status,200);
 assert.equal((await call('login',{email:'mfa@example.invalid',password:'fake-very-long-password',mfaCode:code(setup.data.secret,step+1)})).status,200);
});
