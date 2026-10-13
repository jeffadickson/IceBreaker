'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createRinkServer}=require('../../server/rink-server');
test('family and encrypted-document HTTP routes enforce verified child grants and staff scope',async t=>{
 const previous=process.env.ICEBREAKER_DOCUMENT_KEK_BASE64;
 process.env.ICEBREAKER_DOCUMENT_KEK_BASE64=crypto.randomBytes(32).toString('base64');
 t.after(()=>{if(previous===undefined)delete process.env.ICEBREAKER_DOCUMENT_KEK_BASE64;else process.env.ICEBREAKER_DOCUMENT_KEK_BASE64=previous;});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-doc-http-')),app=createRinkServer({dbPath:path.join(dir,'game.db'),port:0,operatorKey:'bootstrap-test-key'});
 const port=(await app.start()).port,base='http://127.0.0.1:'+port+'/api/registration/v1/';
 t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
 async function call(route,method='GET',body,token,bootstrap=false){
  const r=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(bootstrap?{'X-Operator-Key':'bootstrap-test-key'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
 }
 assert.equal((await call('bootstrap/club','POST',{id:'test-club',name:'Test Club',leagueId:'demo-league'},null,true)).status,201);
 assert.equal((await call('bootstrap/team','POST',{clubId:'test-club',teamId:'maple'},null,true)).status,201);
 for(const [email,role,scopeId] of [['registrar@example.invalid','CLUB_REGISTRAR','test-club'],['admin@example.invalid','LEAGUE_ADMIN','demo-league']]){
  assert.equal((await call('bootstrap/user','POST',{email,password:'fictional-long-password',role,scopeId},null,true)).status,201);
 }
 const club=(await call('login','POST',{email:'registrar@example.invalid',password:'fictional-long-password'})).data.token;
 const league=(await call('login','POST',{email:'admin@example.invalid',password:'fictional-long-password'})).data.token;
 const created=await call('players','POST',{displayName:'Fictional Player',legalName:'Private Name',birthDate:'2016-02-01'},club);
 assert.equal(created.status,201);
 const playerId=created.data.playerId;
 const link=await call('players/'+playerId+'/related-people','POST',{fullName:'Fictional Parent',email:'parent@example.invalid',relationship:'PARENT'},club);
 assert.equal(link.status,201);
 const personId=link.data.personId;
 assert.equal((await call('guardian-admin/provision','POST',{personId,email:'parent@example.invalid',password:'fictional-family-password'},club)).status,403);
 assert.equal((await call('guardian-admin/provision','POST',{personId,email:'parent@example.invalid',password:'fictional-family-password'},league)).status,201);
 const family=(await call('family/login','POST',{email:'parent@example.invalid',password:'fictional-family-password'})).data.token;
 assert.equal((await call('family/context','GET',null,family)).data.children.length,0);
 const data=Buffer.from('%PDF-1.7\nFAKE CHILD RECORD\n%%EOF');
 const upload={documentType:'BIRTH_CERTIFICATE',mime:'application/pdf',base64:data.toString('base64')};
 assert.equal((await call('family/players/'+playerId+'/documents','POST',upload,family)).status,403);
 assert.equal((await call('guardian-admin/grants','POST',{personId,playerId,canViewDocuments:true,canUploadDocuments:true},league)).status,201);
 assert.equal((await call('family/context','GET',null,family)).data.children.length,1);
 const result=await call('family/players/'+playerId+'/documents','POST',upload,family);
 assert.equal(result.status,201);
 assert.equal(result.data.status,'QUARANTINED');
 const docId=result.data.documentId;
 assert.equal((await call('family/players/'+playerId+'/documents','GET',null,family)).data.documents[0].status,'QUARANTINED');
 assert.equal((await call('family/documents/'+docId,'GET',null,family)).status,400);
 assert.equal((await call('documents/'+docId+'/decision','POST',{decision:'VERIFIED',note:'reviewed'},league)).status,400);
 assert.equal((await call('guardian-admin/grants/revoke','POST',{personId,playerId},league)).status,200);
 assert.equal((await call('family/players/'+playerId+'/documents','GET',null,family)).status,403);
 assert.equal((await call('family/logout','POST',null,family)).status,200);
 assert.equal((await call('family/context','GET',null,family)).status,403);
 const file=fs.readFileSync(path.join(dir,'private-document-vault',docId+'.bin'));
 assert.equal(file.includes(Buffer.from('FAKE CHILD RECORD')),false);
});
