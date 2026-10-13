#!/usr/bin/env node
'use strict';
// Rebuilds a comprehensive schema reference from fresh, fictional SQLite
// instances. Never reads or writes real user records.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createRinkServer}=require('../server/rink-server');
const {EvidenceArchive}=require('../server/email-evidence-archive');
const {createCentralServer}=require('../../../../services/ingest/central-server');
const {inventory,render}=require('./schema-catalog');
async function generate(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-schema-'));
 const leaguePath=path.join(dir,'league-rink.sqlite');
 const centralPath=path.join(dir,'central-ingest.sqlite');
 const evidencePath=path.join(dir,'email-evidence.sqlite');
 let rink=null,central=null;
 try{
  rink=createRinkServer({dbPath:leaguePath,port:0,operatorKey:'fictional-schema-operator'});
  await rink.start();
  await rink.stop();rink=null;
  central=createCentralServer({dbPath:centralPath,port:0,adminKey:'fictional-schema-admin-key-12345'});
  await central.start();await central.close();central=null;
  const evidence=new EvidenceArchive(evidencePath);evidence.close();
  const data=[
   inventory(leaguePath,'League, registration, family, timekeeper and scoresheet (development SQLite)'),
   inventory(centralPath,'Central signed-event ingestion (separate SQLite)'),
   inventory(evidencePath,'Encrypted email certificate evidence archive (separate SQLite)')
  ];
  return {data,markdown:render(data)};
 }finally{
  if(rink)try{await rink.stop();}catch{}
  if(central)try{await central.close();}catch{}
  fs.rmSync(dir,{recursive:true,force:true});
 }
}
async function main(argv=process.argv.slice(2)){
 if(argv.length!==2||argv[0]!=='--out')throw Error('Usage: node generate-schema-reference.js --out path/to/reference.md');
 const result=await generate();
 fs.mkdirSync(path.dirname(path.resolve(argv[1])),{recursive:true});
 fs.writeFileSync(path.resolve(argv[1]),result.markdown,'utf8');
 process.stdout.write(JSON.stringify({databases:result.data.map(d=>({label:d.label,objects:d.objects.length})),output:argv[1]})+'\n');
}
if(require.main===module)main().catch(e=>{process.stderr.write('Schema generation failed: '+e.message+'\n');process.exitCode=1;});
module.exports={generate};
