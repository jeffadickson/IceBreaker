'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..');
const audit=path.join(root,'tools/audit_code_docs.py');

test('DOC-AUDIT-001 per-file documentation totals reconcile with report findings',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-doc-audit-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const output=path.join(dir,'report.json');
 const run=spawnSync('python',['-X','utf8',audit,'--output',output],{cwd:root,encoding:'utf8',timeout:30000});
 assert.equal(run.status,0,run.error?.message||run.stderr);
 const report=JSON.parse(fs.readFileSync(output,'utf8'));
 assert.deepEqual(report.parse_failures,[]);
 assert.ok(report.tracked_files>0);
 assert.equal(report.files.length,report.tracked_files);
 assert.equal(new Set(report.files.map(f=>f.path)).size,report.files.length);
 assert.equal(report.files.reduce((n,f)=>n+f.declarations,0),Object.values(report.declarations).reduce((a,b)=>a+b,0));
 assert.equal(report.files.reduce((n,f)=>n+f.missing,0),report.missing_count);
 assert.equal(report.findings.length,report.missing_count);
 for(const file of report.files){
  assert.ok(Number.isInteger(file.missing)&&file.missing>=0&&file.missing<=file.declarations,file.path);
  assert.equal(report.findings.filter(f=>f.path===file.path).length,file.missing,file.path);
 }
});

test('DOC-AUDIT-001 strict threshold fails without suppressing report evidence',()=>{
 // A negative budget guarantees rejection independent of future documentation improvements.
 const run=spawnSync('python',['-X','utf8',audit,'--max-missing','-1'],{cwd:root,encoding:'utf8',timeout:30000});
 assert.equal(run.status,1,run.error?.message||run.stderr);
 assert.match(run.stdout,/Documentation audit: \d+ files/);
 const malformed=spawnSync('python',['-X','utf8',audit,'--max-missing','not-an-integer'],{cwd:root,encoding:'utf8',timeout:30000});
 assert.equal(malformed.status,2);
 assert.match(malformed.stderr,/invalid int value/);
});
