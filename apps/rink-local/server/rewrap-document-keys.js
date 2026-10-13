'use strict';
// Offline KEK rotation. Run with registration service stopped, a verified
// encrypted backup, and distinct old/new KEKs provisioned outside Git.
const fs=require('node:fs'),path=require('node:path');
const {RegistrationPortal}=require('./registration-portal');
function parseKey(name){
 const value=process.env[name],bytes=value?Buffer.from(value,'base64'):null;
 if(!bytes||bytes.length!==32||bytes.toString('base64')!==value)throw Error(name+' must be a base64 256-bit key');
 return bytes;
}
function main(args=process.argv.slice(2)){
 if(args.length!==3||args[1]!=='--apply'||args[2]!=='--backup-verified')
  throw Error('Usage: node rewrap-document-keys.js /absolute/path/to/league.db --apply --backup-verified');
 const file=path.resolve(args[0]);if(!fs.existsSync(file))throw Error('Database file not found');
 const oldKey=parseKey('ICEBREAKER_OLD_DOCUMENT_KEK_BASE64'),newKey=parseKey('ICEBREAKER_NEW_DOCUMENT_KEK_BASE64');
 const portal=new RegistrationPortal(file);
 try{const result=portal.documents.rewrapKeys(oldKey,newKey,{backupVerified:true});process.stdout.write(JSON.stringify(result)+'\n');}
 finally{portal.close();oldKey.fill(0);newKey.fill(0);}
}
if(require.main===module){try{main();}catch(error){process.stderr.write('Key rotation refused: '+error.message+'\n');process.exitCode=1;}}
module.exports={main};
