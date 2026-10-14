'use strict';
// Evidence-aware beta release gate. This tool is intentionally fail-closed:
// source code, green CI and unreviewed checkboxes are not field acceptance.
const fs=require('node:fs'),path=require('node:path');
const DEFAULT_ROOT=path.resolve(__dirname,'../../..');
const PROFILES=new Set(['rink-simulation','supervised-beta','frappe-beta','production']);
function loadManifest(root=DEFAULT_ROOT){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'requirements/beta-acceptance-gates.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.gates)||!manifest.profiles)throw Error('Unsupported beta gate manifest');
 const ids=manifest.gates.map(g=>g.id);
 if(new Set(ids).size!==ids.length)throw Error('Duplicate gate IDs');
 return manifest;
}
function requiredGates(manifest,profile,seen=new Set()){
 if(!PROFILES.has(profile)||!manifest.profiles[profile])throw Error('Unknown beta profile');
 if(seen.has(profile))throw Error('Circular profile inheritance');
 seen.add(profile);
 const p=manifest.profiles[profile];
 const inherited=p.extends?requiredGates(manifest,p.extends,seen):[];
 return [...new Set([...inherited,...p.gates])];
}
function safeEvidenceFile(root,rel){
 if(typeof rel!=='string'||!rel.trim()||path.isAbsolute(rel)||rel.includes('\0'))return false;
 const full=path.resolve(root,rel);
 if(!full.startsWith(path.resolve(root)+path.sep))return false;
 try{return fs.statSync(full).isFile()&&!fs.lstatSync(full).isSymbolicLink();}
 catch{return false;}
}
function assess(manifest,{profile,revision,evidence=[],root=DEFAULT_ROOT,now=new Date()}){
 if(typeof revision!=='string'||!/^[a-f0-9]{7,40}$/i.test(revision))throw Error('Explicit Git revision required');
 if(!Array.isArray(evidence))throw Error('Evidence must be an array');
 const ids=requiredGates(manifest,profile),definitions=new Map(manifest.gates.map(g=>[g.id,g]));
 const entries=new Map();
 for(const entry of evidence){
  if(!entry||typeof entry!=='object'||typeof entry.id!=='string'||entries.has(entry.id))throw Error('Duplicate or malformed evidence');
  if(!definitions.has(entry.id))throw Error('Unknown evidence gate');
  entries.set(entry.id,entry);
 }
 const gates=ids.map(id=>{
  const gate=definitions.get(id);
  if(!gate)throw Error('Unknown required gate '+id);
  const e=entries.get(id),issues=[];
  if(!e)issues.push('no evidence recorded');
  else{
   if(e.result!=='PASS')issues.push('not marked PASS');
   if(e.revision!==revision)issues.push('evidence revision does not match requested build');
   if(typeof e.reviewer!=='string'||e.reviewer.trim().length<3||e.reviewer.length>160)issues.push('reviewer missing');
   if(typeof e.executedAt!=='string'||!(/^\d{4}-\d{2}-\d{2}T/.test(e.executedAt))||
      !Number.isFinite(Date.parse(e.executedAt))||Date.parse(e.executedAt)>now.getTime())issues.push('invalid or future execution timestamp');
   if(!safeEvidenceFile(root,e.artifact))issues.push('evidence artifact not found within repository');
  }
  return {...gate,status:issues.length?'BLOCKED':'RECORDED_PASS',issues};
 });
 const blocked=gates.filter(g=>g.status==='BLOCKED');
 return {profile,revision,decision:blocked.length?'NO_GO':'EVIDENCE_RECORDED',passed:gates.length-blocked.length,
  required:gates.length,blocked:blocked.length,gates,
  disclaimer:'Evidence-recorded is not automatic operational or legal approval; reviewers must validate artifacts and sign the release.'};
}
function parseArgs(argv){
 const args={};
 for(let i=0;i<argv.length;i++){
  if(!['--profile','--revision','--evidence','--root','--strict'].includes(argv[i]))throw Error('Unknown argument '+argv[i]);
  if(argv[i]==='--strict'){args.strict=true;continue;}
  if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing argument value');
  args[argv[i].slice(2)]=argv[++i];
 }
 return args;
}
function main(argv=process.argv.slice(2)){
 const a=parseArgs(argv),root=path.resolve(a.root||DEFAULT_ROOT);
 if(!a.profile||!a.revision)throw Error('Usage: beta-readiness.js --profile rink-simulation|supervised-beta|frappe-beta|production --revision GIT_SHA [--evidence file.json] [--strict]');
 const evidence=a.evidence?JSON.parse(fs.readFileSync(path.resolve(a.evidence),'utf8')):[];
 const result=assess(loadManifest(root),{profile:a.profile,revision:a.revision,evidence,root});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(a.strict&&result.decision!=='EVIDENCE_RECORDED')process.exitCode=2;
 return result;
}
if(require.main===module){try{main();}catch(e){process.stderr.write('Beta readiness: '+e.message+'\n');process.exitCode=1;}}
module.exports={loadManifest,requiredGates,safeEvidenceFile,assess,parseArgs,main};
