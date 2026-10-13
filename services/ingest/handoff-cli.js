#!/usr/bin/env node
'use strict';
// Development operator-only handoff. Never use against a public server or
// with real league data until production authorization and KMS are complete.
const fs=require('node:fs'),readline=require('node:readline/promises');
const {handoff}=require('./verified-handoff');
function parse(argv){
 const opts={};
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(!['--remote','--db','--game','--station','--private-key'].includes(k)||!argv[i+1]||argv[i+1].startsWith('--')||opts[k])
   throw Error('Usage: node handoff-cli.js --remote http://127.0.0.1:8091 --db standby.sqlite --game GAME --station STATION --private-key station.pem');
  opts[k]=argv[++i];
 }
 if(Object.keys(opts).length!==5)throw Error('All five handoff arguments required');
 return opts;
}
async function main(argv=process.argv.slice(2)){
 if(process.env.ICEBREAKER_PRODUCTION_MODE==='1')throw Error('Development handoff CLI disabled in production');
 if(!process.stdin.isTTY)throw Error('Interactive terminal required');
 const opts=parse(argv),adminKey=process.env.ICEBREAKER_INGEST_ADMIN_KEY;
 if(!adminKey||adminKey.length<24)throw Error('Admin secret required in backend environment');
 const privateKey=fs.readFileSync(opts['--private-key'],'utf8');
 const rl=readline.createInterface({input:process.stdin,output:process.stderr});
 try{
  const result=await handoff({remoteUrl:opts['--remote'],dbPath:opts['--db'],gameId:opts['--game'],stationId:opts['--station'],adminKey,privateKey,
   confirm:async details=>{
    process.stderr.write('Takeover game '+details.gameId+' by '+details.stationId+
     '\nCentral journal events: '+details.events+', new epoch: '+details.epoch+
     '\nPeriod '+details.period+', remaining seconds '+details.seconds+
     '\nGoalies: '+JSON.stringify(details.goalies)+
     '\nThe old timekeeper must be stopped. Any unuploaded old-laptop events require manual reconciliation.\n');
    return (await rl.question('Type the exact game ID to authorize takeover: '))===details.gameId;
   }});
  process.stdout.write(JSON.stringify(result)+'\n');
  process.stderr.write('Close/reopen the standby timekeeper to load restored state before operating the game.\n');
 }finally{rl.close();}
}
if(require.main===module)main().catch(e=>{process.stderr.write('Handoff refused: '+e.message+'\n');process.exitCode=1;});
module.exports={parse,main};
