#!/usr/bin/env node
'use strict';
// Offline, fictional-only M4.2 policy staging. No eligibility activation.
const fs=require('node:fs'),path=require('node:path');
const {openTrainingStagingDatabase,stageSignedTraining,latestStagedTraining}=require('./frappe-training-staging');
function parseArgs(argv){
 const opts={};
 if(argv.length%2!==0)throw Error('Options must have values');
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],value=argv[i+1];
  if(!['--staging-db','--bundle','--trust','--league'].includes(key)||!value||value.startsWith('--')||opts[key])
   throw Error('Usage: node stage-frappe-training.js --staging-db CACHE.db --bundle signed.json --trust pinned-keys.json --league LEAGUE_ID');
  opts[key]=value;
 }
 for(const key of ['--staging-db','--bundle','--trust','--league'])if(!opts[key])throw Error('Missing '+key);
 return opts;
}
function readBoundedJson(filename,limit){
 const full=path.resolve(filename),stat=fs.statSync(full);
 if(!stat.isFile()||stat.size>limit)throw Error('Invalid or oversized JSON file');
 const value=JSON.parse(fs.readFileSync(full,'utf8'));
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected JSON object');
 return value;
}
function run(argv=process.argv.slice(2)){
 if(process.env.ICEBREAKER_PRODUCTION_MODE==='1')
  throw Error('Development training staging is not production-authorized');
 const opts=parseArgs(argv);
 const bundle=readBoundedJson(opts['--bundle'],512*1024);
 const trust=readBoundedJson(opts['--trust'],16*1024);
 const db=openTrainingStagingDatabase(opts['--staging-db']);
 try{
  const result=stageSignedTraining(db,bundle,trust,opts['--league']);
  return {status:result.status,leagueId:result.leagueId,
   releaseRevision:result.releaseRevision,policyCount:result.policyCount,
   latestRevision:latestStagedTraining(db,opts['--league'])?.releaseRevision};
 }finally{db.close();}
}
if(require.main===module){
 try{process.stdout.write(JSON.stringify(run())+'\n');}
 catch(error){process.stderr.write('Training staging refused: '+error.message+'\n');process.exitCode=1;}
}
module.exports={parseArgs,readBoundedJson,run};
