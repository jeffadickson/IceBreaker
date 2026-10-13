'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const demo=require('../../server/demo-registration-email');
const {EvidenceArchive}=require('../../server/email-evidence-archive');
const {DatabaseSync}=require('node:sqlite');
const cli=require('../../server/icebreaker-admin');
function fixture(t){
 const oldKeys={};
 for(const key of ['ICEBREAKER_DOCUMENT_KEK_BASE64','ICEBREAKER_INGEST_HMAC_KEY_BASE64']){
  oldKeys[key]=process.env[key];process.env[key]=crypto.randomBytes(32).toString('base64');
 }
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ib-fake-email-'));
 t.after(()=>{fs.rmSync(root,{recursive:true,force:true});for(const [key,value] of Object.entries(oldKeys)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const created=demo.setup(root);
 return {root,created,paths:demo.paths(root)};
}
test('preview and incorrect name confirmation do not commit image or intake',async t=>{
 const x=fixture(t);
 const preview=await demo.run('preview',x.root);
 assert.equal(preview.committed,false);assert.equal(preview.preview.claimedName,'Alex Example');
 assert.equal(preview.preview.nameMatches,true);
 assert.equal(fs.existsSync(x.paths.archive),false);
 await assert.rejects(()=>demo.run('import',x.root,{askName:async()=> 'Wrong Name'}),/Exact legal-name confirmation/);
 assert.equal(fs.existsSync(x.paths.archive),false);
 const db=new DatabaseSync(x.paths.db);
 try{assert.equal(db.prepare('SELECT COUNT(*) n FROM training_intake').get().n,0);}
 finally{db.close();}
});
test('confirmed fake email encrypts attachment in separate DB and stages PENDING, idempotently',async t=>{
 const x=fixture(t);
 const result=await demo.run('import',x.root,{askName:async()=> 'Alex Example'});
 assert.equal(result.committed,true);assert.equal(result.state,'PENDING');assert.equal(result.evidenceStatus,'QUARANTINED');
 assert.equal(fs.existsSync(x.paths.archive),true);
 const raw=fs.readFileSync(x.paths.archive);
 assert.equal(raw.includes(Buffer.from('iVBORw0KGgo')),false);
 const archive=new EvidenceArchive(x.paths.archive);
 const row=archive.db.prepare('SELECT * FROM archived_evidence WHERE id=?').get(result.evidenceId);
 assert.equal(row.scan_state,'QUARANTINED');
 assert.equal(row.encrypted_data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),false);
 assert.equal(archive.db.prepare('SELECT COUNT(*) n FROM evidence_audit').get().n,1);
 const original=archive.decryptForReview(result.evidenceId,'test-review');
 assert.equal(original.mime,'image/png');assert.equal(original.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),true);
 archive.close();
 const db=new DatabaseSync(x.paths.db);
 try{
  assert.equal(db.prepare('SELECT COUNT(*) n FROM training_intake').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM training_completions_v2').get().n,0);
  assert.equal(db.prepare('SELECT evidence_ref FROM training_intake').get().evidence_ref,'archive:'+result.evidenceId);
  assert.throws(()=>cli.execute(db,'verify',{intake:result.intakeId,actor:'registrar',note:'Checked',attestReviewed:true,archive:x.paths.archive}),/must pass malware scan/);
 }finally{db.close();}
 const repeat=await demo.run('import',x.root,{askName:async()=> 'Alex Example'});
 assert.equal(repeat.duplicate,true);assert.equal(repeat.evidenceId,result.evidenceId);
 const archived=new EvidenceArchive(x.paths.archive);
 try{assert.equal(archived.db.prepare('SELECT COUNT(*) n FROM archived_evidence').get().n,1);}
 finally{archived.close();}
});
test('ClamAV clean scan permits human approval, rejected scan never permits approval',async t=>{
 const x=fixture(t);
 const result=await demo.run('import',x.root,{askName:async()=> 'Alex Example'});
 const archive=new EvidenceArchive(x.paths.archive);
 try{
  await assert.rejects(()=>archive.scanQuarantined(result.evidenceId,'scanner',async()=>{throw Error('Scanner unavailable');}),/Scanner unavailable/);
  assert.equal(archive.scanStatus(result.evidenceId),'QUARANTINED');
  await archive.scanQuarantined(result.evidenceId,'scanner',async()=>({engine:'clamav',clean:true}));
  assert.equal(archive.scanStatus(result.evidenceId),'CLEAN');
 }finally{archive.close();}
 const db=new DatabaseSync(x.paths.db);
 try{
  const approval=cli.execute(db,'verify',{intake:result.intakeId,actor:'registrar',note:'Checked against issuer',attestReviewed:true,archive:x.paths.archive});
  assert.equal(approval.state,'VERIFIED');assert.ok(approval.completionId);
 }finally{db.close();}
});
test('mismatched email participant name fails closed even if operator types selected name',async t=>{
 const x=fixture(t),mail=JSON.parse(fs.readFileSync(x.paths.mail,'utf8'));
 mail.body=mail.body.replace('Alex Example','Another Person');
 fs.writeFileSync(x.paths.mail,JSON.stringify(mail));
 const p=await demo.run('preview',x.root);
 assert.equal(p.preview.nameMatches,false);
 await assert.rejects(()=>demo.run('import',x.root,{askName:async()=> 'Alex Example'}),/names differ/);
 assert.equal(fs.existsSync(x.paths.archive),false);
});
