#!/usr/bin/env node
'use strict';
// Development read-only parity report. Does not stage, activate, or edit rules.
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {compareStagedTraining}=require('./frappe-training-parity');
function parseArgs(argv){
 const opts={};
 if(argv.length%2)throw Error('Missing option value');
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];
  if(!['--staging-db','--local-db','--course-map','--league','--season','--date'].includes(k)||
   !v||v.startsWith('--')||opts[k])throw Error('Invalid parity CLI option');
  opts[k]=v;
 }
 for(const k of ['--staging-db','--local-db','--course-map','--league','--season','--date'])
  if(!opts[k])throw Error('Missing '+k);
 return opts;
}
function readJson(file,limit){
 const full=path.resolve(file),stat=fs.statSync(full);
 if(!stat.isFile()||stat.size>limit)throw Error('Invalid course map file');
 const value=JSON.parse(fs.readFileSync(full,'utf8'));
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected course map object');
 return value;
}
function run(argv=process.argv.slice(2)){
 const opts=parseArgs(argv),stagedPath=path.resolve(opts['--staging-db']),
  localPath=path.resolve(opts['--local-db']);
 if(stagedPath===localPath)throw Error('Training cache and local database must differ');
 for(const filename of [stagedPath,localPath]){
  if(!fs.existsSync(filename)||!fs.statSync(filename).isFile())throw Error('Existing database file required');
 }
 const mapping=readJson(opts['--course-map'],32*1024);
 const stage=new DatabaseSync(stagedPath,{readOnly:true});
 try{
  const local=new DatabaseSync(localPath,{readOnly:true});
  try{return compareStagedTraining(stage,local,opts['--league'],opts['--season'],opts['--date'],mapping);}
  finally{local.close();}
 }finally{stage.close();}
}
if(require.main===module){
 try{
  const result=run();
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result.status!=='match')process.exitCode=2;
 }catch(error){process.stderr.write('Training parity refused: '+error.message+'\n');process.exitCode=1;}
}
module.exports={parseArgs,readJson,run};
