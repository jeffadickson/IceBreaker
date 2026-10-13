'use strict';
// Non-gating diagnostic for the current StrictDoc migration. The existing
// overlapping LEAGUE IDs are reported, never silently merged or marked verified.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function parseSdoc(text,source){
 const items=[];
 const re=/\[REQUIREMENT\]\s*([\s\S]*?)(?=\[REQUIREMENT\]|\[SECTION\]|\[\/DOCUMENT\]|$)/g;
 for(const m of text.matchAll(re)){
  const part=m[1],id=part.match(/^UID:\s*(\S+)/m)?.[1];
  if(!id)continue;
  items.push({id,source,title:part.match(/^TITLE:\s*(.*)$/m)?.[1]||'',
   statement:part.match(/^STATEMENT:\s*(.*)$/m)?.[1]||''});
 }
 return items;
}
function read(rootDir=root){
 const folder=path.join(rootDir,'requirements');
 const files=fs.readdirSync(folder).filter(x=>x.endsWith('.sdoc')).sort();
 const docs=files.flatMap(name=>parseSdoc(fs.readFileSync(path.join(folder,name),'utf8'),name));
 const csv=fs.readFileSync(path.join(folder,'traceability.csv'),'utf8').trim().split(/\r?\n/).slice(1)
  .filter(Boolean).map(line=>{const cols=line.split(',');return {id:cols[0],implementation:cols[1],test:cols[2],status:cols[3]};});
 const baselinePath=path.resolve(rootDir,'../../requirements/baselines/requirements_v3.csv');
 const proposalPath=path.resolve(rootDir,'../../research/source-audit/requirements_v4_proposed_merged.csv');
 const baseline=fs.readFileSync(baselinePath,'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(s=>s.split(',')[0]);
 const proposed=fs.readFileSync(proposalPath,'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(s=>s.split(',')[0]);
 return {docs,csv,baseline,proposed};
}
function summarize({docs,csv,baseline,proposed}){
 const byId=new Map();
 for(const doc of docs){
  if(!byId.has(doc.id))byId.set(doc.id,[]);
  byId.get(doc.id).push(doc);
 }
 const conflicts=[...byId].filter(([,items])=>items.length>1&&new Set(items.map(x=>x.statement)).size>1)
  .map(([id,items])=>({id,sources:items.map(x=>x.source)}));
 const duplicateIds=[...byId].filter(([,items])=>items.length>1).map(([id])=>id);
 const traces=new Map(csv.map(x=>[x.id,x]));
 const missingTrace=[...byId.keys()].filter(id=>!traces.has(id));
 const missingArtifacts=[];
 for(const row of csv){
  for(const field of ['implementation','test']){
   for(const artifact of (row[field]||'').split(';').filter(Boolean)){
    if(!fs.existsSync(path.join(root,artifact)))missingArtifacts.push({id:row.id,field,artifact});
   }
  }
 }
 return {
  baselineRequirements:baseline.length,proposedRequirements:proposed.length,
  strictDocEntries:docs.length,uniqueStrictDocIds:byId.size,
  traceabilityRows:csv.length,duplicateIds,conflicts,missingTrace,
  missingArtifacts,baselineIdsNotInStrictDoc:baseline.filter(id=>!byId.has(id)),
  note:'Traceability rows and file existence are NOT verification evidence. Duplicate IDs require manual reconciliation.'
 };
}
function main(){
 const result=summarize(read());
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(require.main===module)main();
module.exports={parseSdoc,read,summarize};
