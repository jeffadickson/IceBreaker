'use strict';
// Offline one-time migration of legacy private SQLite fields. No PII printed.
// Run with service stopped, encrypted off-host backup verified, and the
// ICEBREAKER_PRIVATE_FIELD_KEY_BASE64 key available to this process.
const {DatabaseSync}=require('node:sqlite');
const {encryptField,decryptField,fieldKey}=require('./private-fields');
const path=require('node:path');
const fs=require('node:fs');
const specs=[
 {table:'player_private_profiles',id:'player_id',fields:[['legal_name','legalName'],['birth_date','birthDate'],['address_json','address']]},
 {table:'player_related_people',id:'id',fields:[['full_name','fullName'],['email','email'],['phone','phone']]},
 {table:'family_person_details',id:'person_id',fields:[['private_json','contactDetails']]}
];
function migration(db,{apply=false,backupVerified=false}={}){
 if(apply&&!backupVerified)throw Error('Verified encrypted offline backup required before applying migration');
 if(apply&&!fieldKey())throw Error('Private-field encryption key required');
 const existing=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
 const stats={tables:0,rows:0,fieldsToEncrypt:0,alreadyEncrypted:0,applied:false};
 if(apply)db.exec('BEGIN IMMEDIATE');
 try{
  for(const spec of specs){
   if(!existing.has(spec.table))continue;
   stats.tables++;
   const cols=[spec.id,...spec.fields.map(f=>f[0])];
   const select=db.prepare('SELECT '+cols.join(',')+' FROM '+spec.table);
   const setters=spec.fields.map(([col])=>col+'=?').join(',');
   const update=db.prepare('UPDATE '+spec.table+' SET '+setters+' WHERE '+spec.id+'=?');
   for(const row of select.all()){
    stats.rows++;
    const values=[];
    let changed=false;
    for(const [col,aadField] of spec.fields){
     const value=row[col];
     if(value===null){values.push(null);continue;}
     if(typeof value!=='string')throw Error('Unexpected legacy private field type');
     if(value.startsWith('enc:v1:')){
      // Verify existing ciphertext can be authenticated before commit.
      if(apply)decryptField(value,row[spec.id],aadField);
      stats.alreadyEncrypted++;values.push(value);
     }else{
      stats.fieldsToEncrypt++;changed=true;
      values.push(apply?encryptField(value,row[spec.id],aadField):value);
     }
    }
    if(apply&&changed)update.run(...values,row[spec.id]);
   }
  }
  if(apply){db.exec('COMMIT');stats.applied=true;}
 }catch(error){if(apply)db.exec('ROLLBACK');throw error;}
 return stats;
}
function main(argv=process.argv.slice(2)){
 const file=argv.find(x=>!x.startsWith('--'));
 if(!file||argv.some(x=>!['--apply','--backup-verified'].includes(x)&&x!==file))
  throw Error('Usage: node migrate-private-fields.js /absolute/path/to/league.db [--apply --backup-verified]');
 const full=path.resolve(file);
 if(!fs.existsSync(full))throw Error('Database file not found');
 if(argv.includes('--apply')&&(!argv.includes('--backup-verified')||!fieldKey()))
  throw Error('Applying migration requires verified encrypted backup and private-field key');
 const db=new DatabaseSync(full);
 try{
  const result=migration(db,{apply:argv.includes('--apply'),backupVerified:argv.includes('--backup-verified')});
  // Only counts, no sensitive contents.
  process.stdout.write(JSON.stringify(result)+'\n');
 }finally{db.close();}
}
if(require.main===module){try{main();}catch(e){process.stderr.write('Migration refused: '+e.message+'\n');process.exitCode=1;}}
module.exports={migration,main};
