#!/usr/bin/env node
'use strict';
// Offline administrative CLI; intended for a restricted backend service account.
// A future email parser may emit the documented JSON contract, not direct SQL.
// NEVER put passwords, mail bodies, certificates or secrets on the command line.
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const training=require('./training-catalog');
const intake=require('./training-intake');
function argsOf(argv){
 const [command,...tail]=argv,opts={};
 if(!command||command.startsWith('--'))throw Error('Command required');
 for(let i=0;i<tail.length;i++){
  const arg=tail[i];
  if(!arg.startsWith('--'))throw Error('Unexpected positional argument');
  const key=arg.slice(2);
  if(!['db','json','actor','intake','note','state','limit','subject-type','subject-id','role','scope-type','scope-id','season-id','date','attest-reviewed','archive'].includes(key))throw Error('Unknown option');
  if(key==='attest-reviewed'){opts.attestReviewed=true;continue;}
  if(opts[key]!==undefined||i===tail.length-1||tail[i+1].startsWith('--'))throw Error('Missing or repeated option');
  opts[key]=tail[++i];
 }
 return {command,opts};
}
function inputJson(file){
 if(!file)throw Error('--json path or - (stdin) required');
 const bytes=file==='-'?fs.readFileSync(0):fs.readFileSync(path.resolve(file));
 if(bytes.length>32768)throw Error('Certificate metadata exceeds 32 KiB');
 const obj=JSON.parse(bytes.toString('utf8'));
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('Expected a JSON object');
 const allowed=new Set(['sourceType','sourceId','trainingId','trainingCode','subjectType','subjectId','completedOn','expiresOn','evidenceRef','verification']);
 if(Object.keys(obj).some(k=>!allowed.has(k)))throw Error('Unknown metadata field; raw email or personal data must not be ingested');
 return obj;
}
function execute(db,command,opts,{readJson=inputJson}={}){
 if(!['catalog','ingest','pending','verify','reject','status'].includes(command))throw Error('Unknown command');
 if(command==='catalog')return {courses:training.catalog(db)};
 if(command==='pending')return {items:intake.list(db,{state:opts.state||'PENDING',limit:opts.limit===undefined?100:Number(opts.limit)})};
 if(command==='ingest'){
  if(!opts.actor)throw Error('--actor required');
  const data=readJson(opts.json);
  if(data.verification!==undefined&&!['PENDING','REVIEW_REQUIRED'].includes(data.verification))
   throw Error('Automated ingestion cannot mark a certificate verified');
  if(data.trainingCode&&!data.trainingId){
   const course=db.prepare('SELECT id FROM training_catalog WHERE code=?').get(String(data.trainingCode).trim().toUpperCase());
   if(!course)throw Error('Unknown training code');
   data.trainingId=course.id;
  }
  return intake.stage(db,data,opts.actor);
 }
 if(command==='verify'||command==='reject'){
  if(!opts.actor||!opts.intake||!opts.note)throw Error('--actor, --intake and --note required');
  if(command==='verify'&&!opts.attestReviewed)throw Error('Verification requires --attest-reviewed after independent review');
  if(command==='verify'){
   const row=db.prepare('SELECT evidence_ref FROM training_intake WHERE id=?').get(opts.intake);
   if(!row)throw Error('Intake not found');
   if(row.evidence_ref?.startsWith('archive:')){
    if(!opts.archive)throw Error('--archive required to validate quarantined email evidence');
    const {EvidenceArchive}=require('./email-evidence-archive');
    const archive=new EvidenceArchive(opts.archive);
    try{
     if(archive.scanStatus(row.evidence_ref.slice(8))!=='CLEAN')throw Error('Evidence must pass malware scan before verification');
    }finally{archive.close();}
   }
  }
  return intake.decide(db,opts.intake,{decision:command==='verify'?'VERIFIED':'REJECTED',reviewer:opts.actor,note:opts.note});
 }
 if(command==='status'){
  for(const key of ['subject-type','subject-id','role','scope-type','scope-id','date'])if(!opts[key])throw Error('Missing --'+key);
  const {trainingForRole}=require('./participant-compliance');
  return {status:trainingForRole(db,{subjectType:opts['subject-type'],subjectId:opts['subject-id'],role:opts.role,scopeType:opts['scope-type'],scopeId:opts['scope-id'],seasonId:opts['season-id']||'',date:opts.date})};
 }
}
function main(argv=process.argv.slice(2)){
 if(process.env.ICEBREAKER_PRODUCTION_MODE==='1')throw Error('Development CLI cannot be used for production verification without authenticated registrar authorization');
 const {command,opts}=argsOf(argv);
 if(!opts.db)throw Error('--db existing SQLite file required');
 const file=path.resolve(opts.db);
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw Error('Existing database file required');
 const db=new DatabaseSync(file);
 try{
  db.exec('PRAGMA foreign_keys=ON');
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='league_audit'").get())throw Error('Not an initialized IceBreaker database');
  training.init(db);intake.init(db);
  const result=execute(db,command,opts);
  process.stdout.write(JSON.stringify(result)+'\n');
 }finally{db.close();}
}
if(require.main===module){
 try{main();}
 catch(e){process.stderr.write('IceBreaker CLI: '+e.message+'\n');process.exitCode=1;}
}
module.exports={argsOf,inputJson,execute,main};
