#!/usr/bin/env node
'use strict';
// Offline pilot only: stages authenticated v2 schedules in a separate SQLite
// cache. No API endpoint, clock commands, roster changes or game DB writes.
const fs=require('node:fs'),path=require('node:path');
const {openStagingDatabase,stageSignedSchedule,latestStaged}=require('./frappe-schedule-staging');
const {performance}=require('node:perf_hooks');
function parseArgs(argv){
 const opts={};
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],value=argv[i+1];
  if(!['--staging-db','--bundle','--trust','--league'].includes(key)||!value||value.startsWith('--')||opts[key])
   throw Error('Usage: node stage-frappe-schedule.js --staging-db CACHE.db --bundle signed.json --trust pinned-public-keys.json --league LEAGUE_ID');
  opts[key]=value;
 }
 for(const key of ['--staging-db','--bundle','--trust','--league'])if(!opts[key])throw Error('Missing '+key);
 return opts;
}
function readBoundedJson(filename,limit){
 const file=path.resolve(filename),stats=fs.statSync(file);
 if(!stats.isFile()||stats.size>limit)throw Error('Invalid or oversized JSON file');
 const value=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected JSON object');
 return value;
}
function run(argv=process.argv.slice(2)){
 if(process.env.ICEBREAKER_PRODUCTION_MODE==='1')
  throw Error('Development schedule staging CLI is not production-authorized');
 const opts=parseArgs(argv);
 const bundle=readBoundedJson(opts['--bundle'],512*1024);
 const trust=readBoundedJson(opts['--trust'],16*1024);
 const db=openStagingDatabase(opts['--staging-db']);
 try{
  const outcome=stageSignedSchedule(db,bundle,trust,opts['--league']);
  return {status:outcome.status,leagueId:outcome.leagueId,
   releaseRevision:outcome.releaseRevision,gameCount:outcome.gameCount,
   latest:latestStaged(db,opts['--league'])?.releaseRevision};
 }finally{db.close();}
}
if(require.main===module){
 try{process.stdout.write(JSON.stringify(run())+'\n');}
 catch(error){process.stderr.write('Schedule staging refused: '+error.message+'\n');process.exitCode=1;}
}
module.exports={run,parseArgs,readBoundedJson};
