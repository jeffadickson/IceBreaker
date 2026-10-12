'use strict';
// Builds are performed in CI before invoking this test. This script launches
// the compiled Elsa host and exercises authenticated receiver persistence.
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const temp=mkdtempSync(path.join(os.tmpdir(),'icebreaker-elsa-smoke-'));
const key=crypto.randomBytes(48).toString('hex');
const url='http://127.0.0.1:18494';
const event={eventId:crypto.randomBytes(32).toString('hex'),gameId:'demo-fictional-001',action:'submit',revision:1,definitionDigest:crypto.randomBytes(32).toString('hex'),state:'SUBMITTED'};
let child;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function launch(){
 child=spawn('dotnet',['run','--project',path.join(root,'services/elsa-workflows/IceBreaker.Elsa.csproj'),'-c','Release','--no-build','--no-restore','--urls',url],{cwd:temp,env:{...process.env,ICEBREAKER_ELSA_BRIDGE_KEY:key,ICEBREAKER_ELSA_INBOX_DB:path.join(temp,'inbox.sqlite'),ASPNETCORE_ENVIRONMENT:'Development'},stdio:'pipe'});
 let error='';child.stderr.on('data',x=>error+=x.toString());child.stdout.on('data',x=>error+=x.toString());
 for(let i=0;i<120;i++){
  if(child.exitCode!==null)throw Error('Elsa quit prematurely: '+error.slice(-4000));
  try{const r=await fetch(url+'/healthz');if(r.ok)return;}catch{}
  await pause(250);
 }
 throw Error('Elsa readiness timeout: '+error.slice(-4000));
}
async function stop(){if(!child)return;const p=child;child=null;p.kill('SIGTERM');await Promise.race([new Promise(resolve=>p.once('exit',resolve)),pause(4000)]);if(p.exitCode===null)p.kill('SIGKILL');}
async function post(body,secret=key){return fetch(url+'/api/icebreaker/workflow-events',{method:'POST',headers:{'Content-Type':'application/json','X-IceBreaker-Workflow-Key':secret},body:JSON.stringify(body)});}
(async()=>{try{
 await launch();
 assert.equal((await post(event,'wrong')).status,401);
 assert.equal((await post(event)).status,202);
 assert.equal((await post(event)).status,200);
 assert.equal((await post({...event,revision:2})).status,409);
 await stop();await launch();
 assert.equal((await post(event)).status,200,'Completed receipt should survive restart');
 console.log('ELSA SMOKE PASSED: boot, auth, workflow execution, duplicate, conflict, restart persistence');
 }finally{await stop();rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});