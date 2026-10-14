'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const gate=require('../../tools/beta-readiness');
const sha='a'.repeat(40);
test('beta readiness lists separate rink simulation, supervised beta, Frappe and production gates',()=>{
 const manifest=gate.loadManifest();
 assert.equal(gate.requiredGates(manifest,'rink-simulation').length,6);
 assert.equal(gate.requiredGates(manifest,'supervised-beta').length,11);
 assert.equal(gate.requiredGates(manifest,'frappe-beta').length,6);
 assert.equal(gate.requiredGates(manifest,'production').length,17);
 assert.ok(manifest.gates.some(x=>x.id==='FRAPPE-02'));
 assert.ok(manifest.gates.some(x=>x.id==='PROD-01'));
});
test('no evidence is NO_GO, even if the source and CI tests exist',()=>{
 const r=gate.assess(gate.loadManifest(),{profile:'rink-simulation',revision:sha});
 assert.equal(r.decision,'NO_GO');assert.equal(r.blocked,6);
 assert.equal(r.gates.every(g=>g.status==='BLOCKED'),true);
});
test('evidence must be version-bound, reviewed, dated and backed by a real artifact',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-beta-gate-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'evidence'));fs.writeFileSync(path.join(dir,'evidence','test-log.txt'),'fictional test log\n');
 const manifest=gate.loadManifest();
 const record={id:'SIM-01',result:'PASS',revision:sha,reviewer:'Fictional QA Reviewer',
  executedAt:'2026-10-13T20:00:00Z',artifact:'evidence/test-log.txt'};
 let r=gate.assess(manifest,{profile:'rink-simulation',revision:sha,root:dir,evidence:[record]});
 assert.equal(r.passed,1);assert.equal(r.blocked,5);
 for(const bad of [{...record,revision:'b'.repeat(40)},{...record,artifact:'../outside.txt'},
  {...record,reviewer:''},{...record,executedAt:'2035-01-01T00:00:00Z'}]){
  r=gate.assess(manifest,{profile:'rink-simulation',revision:sha,root:dir,evidence:[bad]});
  assert.equal(r.passed,0);
 }
 assert.throws(()=>gate.assess(manifest,{profile:'rink-simulation',revision:sha,evidence:[record,record]}),/Duplicate/);
 assert.throws(()=>gate.assess(manifest,{profile:'rink-simulation',revision:sha,evidence:[{...record,id:'UNKNOWN'}]}),/Unknown/);
});
test('all recorded evidence changes status only to EVIDENCE_RECORDED, not automatic production approval',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-beta-pass-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'evidence'));fs.writeFileSync(path.join(dir,'evidence','log.txt'),'fictional evidence');
 const manifest=gate.loadManifest();
 const evidence=gate.requiredGates(manifest,'rink-simulation').map(id=>({id,result:'PASS',revision:sha,
  reviewer:'Fictional QA Reviewer',executedAt:'2026-10-13T20:00:00Z',artifact:'evidence/log.txt'}));
 const result=gate.assess(manifest,{profile:'rink-simulation',revision:sha,evidence,root:dir});
 assert.equal(result.decision,'EVIDENCE_RECORDED');
 assert.equal(result.blocked,0);
 assert.match(result.disclaimer,/not automatic operational/);
});
