'use strict';
// Dedicated backend worker. Run with the registration service stopped or in a
// separately managed worker process. No public endpoint can attest scan success.
// Usage: node scan-quarantine.js /absolute/path/to/league.db
const fs=require('node:fs'),path=require('node:path');
const {RegistrationPortal}=require('./registration-portal');
async function scanQueue(portal,{limit=25,actor='clamav-worker'}={}){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid scan batch size');
 if(!process.env.ICEBREAKER_CLAMAV_SOCKET)throw Error('ClamAV Unix socket required');
 const pending=portal.db.prepare("SELECT id FROM private_documents WHERE status='QUARANTINED' ORDER BY uploaded_at,id LIMIT ?").all(limit);
 const summary={scanned:0,clean:0,rejected:0,errors:0};
 for(const {id} of pending){
  try{
   const result=await portal.documents.scanQuarantined(id,actor);
   summary.scanned++;
   if(result.status==='PENDING')summary.clean++;else summary.rejected++;
  }catch(error){
   summary.errors++;
   // No filenames, personal data, plaintext or key material in logs.
   process.stderr.write('Quarantined document scan failed for opaque ID '+id+'\n');
  }
 }
 return summary;
}
async function main(args=process.argv.slice(2)){
 if(args.length!==1)throw Error('Usage: node scan-quarantine.js /absolute/path/to/league.db');
 const file=path.resolve(args[0]);
 if(!fs.existsSync(file))throw Error('Database file not found');
 const portal=new RegistrationPortal(file);
 try{
  const summary=await scanQueue(portal);
  process.stdout.write(JSON.stringify(summary)+'\n');
  if(summary.errors)process.exitCode=1;
 }finally{portal.close();}
}
if(require.main===module)main().catch(e=>{process.stderr.write('Scan worker stopped: '+e.message+'\n');process.exitCode=1;});
module.exports={scanQueue};
