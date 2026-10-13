#!/usr/bin/env node
'use strict';
// Backend-only evidence scanner. No --clean flag and no manual scanner bypass.
const fs=require('node:fs'),path=require('node:path');
const {EvidenceArchive}=require('./email-evidence-archive');
async function scanArchive(file,{limit=25,scanner}={}){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid scan limit');
 if(!scanner&&!process.env.ICEBREAKER_CLAMAV_SOCKET)throw Error('ClamAV local socket required');
 const archive=new EvidenceArchive(file),summary={clean:0,rejected:0,errors:0};
 try{
  const rows=archive.db.prepare("SELECT id FROM archived_evidence WHERE scan_state='QUARANTINED' ORDER BY created_at,id LIMIT ?").all(limit);
  for(const row of rows){
   try{
    const result=await archive.scanQuarantined(row.id,'email-evidence-scanner',scanner);
    if(result.scanState==='CLEAN')summary.clean++;else summary.rejected++;
   }catch{
    summary.errors++;
    process.stderr.write('Email evidence scan failed for opaque ID '+row.id+'\n');
   }
  }
  return summary;
 }finally{archive.close();}
}
async function main(args=process.argv.slice(2)){
 if(args.length!==2||args[0]!=='--archive')throw Error('Usage: node scan-email-evidence.js --archive /absolute/path/to/encrypted-email-evidence.db');
 if(process.env.ICEBREAKER_PRODUCTION_MODE==='1')throw Error('Demo scanner is not production deployment');
 const file=path.resolve(args[1]);
 if(!fs.existsSync(file))throw Error('Evidence archive not found');
 const result=await scanArchive(file);
 process.stdout.write(JSON.stringify(result)+'\n');
 if(result.errors)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{process.stderr.write('Evidence scan refused: '+e.message+'\n');process.exitCode=1;});
module.exports={scanArchive};
