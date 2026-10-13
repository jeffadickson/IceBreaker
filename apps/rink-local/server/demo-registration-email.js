#!/usr/bin/env node
'use strict';
// Fictional-only demonstration: setup, preview, confirm name, archive image,
// and stage PENDING certificate. No mailbox credentials or real emails.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const readline=require('node:readline/promises');
const {LeagueStore}=require('./league-store');
const {PlayerRegistry}=require('./player-registry');
const training=require('./training-catalog');
const {parseMockEmail}=require('./mock-registration-email');
const workflow=require('./mock-email-workflow');
const {EvidenceArchive}=require('./email-evidence-archive');
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
function paths(workspace){
 if(!workspace||typeof workspace!=='string')throw Error('--workspace required');
 const root=path.resolve(workspace);
 return {root,db:path.join(root,'league.db'),archive:path.join(root,'encrypted-email-evidence.db'),mail:path.join(root,'fictional-email.json'),identity:path.join(root,'demo-identity.json')};
}
function setup(workspace){
 const p=paths(workspace);
 if(fs.existsSync(p.db)||fs.existsSync(p.archive)||fs.existsSync(p.mail))throw Error('Demo workspace already contains data');
 fs.mkdirSync(p.root,{recursive:true,mode:0o700});
 const league=new LeagueStore(p.db,{seedDemo:true});
 const registry=new PlayerRegistry(p.db);
 try{
  const playerId=registry.createPlayer({displayName:'Alex Example',legalName:'Alex Example',birthDate:'2016-02-01'},'fictional-demo').playerId;
  training.createTraining(league.db,{code:'LEAGUE_ORIENTATION',title:'Fictional league registration orientation',issuer:'FICTIONAL FOOTHILLS'},'fictional-demo');
  const mail={
   messageId:'fictional-message-'+crypto.randomUUID(),
   from:'certificates@fictional-foothills.example.invalid',
   subject:'Fictional Foothills League Registration Certificate',
   body:'Participant Name: Alex Example\nRegistration Number: FAKE-2026-0001\nCourse Code: LEAGUE_ORIENTATION\nCompleted On: 2026-10-01\nExpires On: 2027-09-30',
   attachment:{mime:'image/png',base64:PNG}
  };
  fs.writeFileSync(p.mail,JSON.stringify(mail,null,2),{mode:0o600,flag:'wx'});
  fs.writeFileSync(p.identity,JSON.stringify({subjectType:'PLAYER',subjectId:playerId},null,2),{mode:0o600,flag:'wx'});
  return {workspace:p.root,subjectType:'PLAYER',subjectId:playerId,emailFile:p.mail,evidenceDatabase:p.archive};
 }finally{registry.close();league.close();}
}
function openWorkspace(workspace){
 const p=paths(workspace);
 if(!fs.existsSync(p.db)||!fs.existsSync(p.mail))throw Error('Run setup first');
 const mail=JSON.parse(fs.readFileSync(p.mail,'utf8'));
 if(fs.statSync(p.mail).size>2000000)throw Error('Mock email too large');
 const identity=JSON.parse(fs.readFileSync(p.identity,'utf8'));
 const {DatabaseSync}=require('node:sqlite');
 const db=new DatabaseSync(p.db);db.exec('PRAGMA foreign_keys=ON');
 return {p,db,mail,identity};
}
async function run(command,workspace,{askName,actor='fictional-demo-registrar'}={}){
 if(process.env.ICEBREAKER_PRODUCTION_MODE==='1')throw Error('Demo cannot run in production mode');
 if(command==='setup')return setup(workspace);
 const {p,db,mail,identity}=openWorkspace(workspace);
 try{
  const details=workflow.preview(db,mail,identity);
  const report={claimedName:details.parsed.claimedName,selectedLegalName:details.legalName,
   subjectId:details.subjectId,nameMatches:details.nameMatches,
   course:details.parsed.trainingCode,registrationNumber:details.parsed.registrationNumber,
   completedOn:details.parsed.completedOn,expiresOn:details.parsed.expiresOn,
   attachmentMime:details.parsed.mime,attachmentBytes:details.parsed.bytes.length};
  if(command==='preview')return {preview:report,committed:false};
  if(command!=='import')throw Error('Commands: setup, preview, import');
  if(!details.nameMatches)throw Error('Certificate and selected person names differ; stop for manual review');
  if(typeof askName!=='function')throw Error('Interactive name confirmation required');
  const typed=await askName(report);
  const result=workflow.commit(db,mail,{...identity,confirmedName:typed,actor,archivePath:p.archive});
  return {preview:report,committed:true,...result};
 }finally{db.close();}
}
async function main(argv=process.argv.slice(2)){
 const [command,flag,workspace]=argv;
 if(flag!=='--workspace'||!workspace||argv.length!==3)throw Error('Usage: node demo-registration-email.js setup|preview|import --workspace /path/to/demo');
 let prompt=null,rl=null;
 if(command==='import'){
  if(!process.stdin.isTTY)throw Error('Interactive terminal required for legal-name confirmation');
  rl=readline.createInterface({input:process.stdin,output:process.stderr});
  prompt=async details=>{
   process.stderr.write('Mock email name: '+details.claimedName+'\nSelected player legal name: '+details.selectedLegalName+
    '\nRegistration: '+details.registrationNumber+'\nCourse: '+details.course+
    '\nNo record or image has been committed yet.\n');
   return rl.question('Type the EXACT selected legal name to confirm identity: ');
  };
 }
 try{process.stdout.write(JSON.stringify(await run(command,workspace,{askName:prompt}))+'\n');}
 finally{if(rl)rl.close();}
}
if(require.main===module)main().catch(e=>{process.stderr.write('Demo refused: '+e.message+'\n');process.exitCode=1;});
module.exports={setup,run,paths};
