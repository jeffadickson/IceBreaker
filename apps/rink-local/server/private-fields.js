'use strict';
// Opt-in application-layer encryption for newly written private player fields.
// Existing plaintext records require an explicit migration before production.
const crypto=require('node:crypto');
const PREFIX='enc:v1:';
function fieldKey(){
 const raw=process.env.ICEBREAKER_PRIVATE_FIELD_KEY_BASE64;
 if(!raw){if(process.env.ICEBREAKER_REQUIRE_PRIVATE_FIELD_ENCRYPTION==='1')throw Error('Private-field encryption is mandatory but no key is configured');return null;}
 const key=Buffer.from(raw,'base64');
 if(key.length!==32||key.toString('base64')!==raw)throw Error('Invalid private-field encryption key');
 return key;
}
function encryptField(value,playerId,field){
 const key=fieldKey();if(!key)return value;
 const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
 cipher.setAAD(Buffer.from('icebreaker-field-v1:'+playerId+':'+field));
 const ciphertext=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
 return PREFIX+Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString('base64');
}
function decryptField(value,playerId,field){
 if(typeof value!=='string'||!value.startsWith(PREFIX)){
  if(process.env.ICEBREAKER_REQUIRE_PRIVATE_FIELD_ENCRYPTION==='1'&&value!==null)throw Error('Unencrypted legacy private field requires migration');
  return value;
 }
 const key=fieldKey();if(!key)throw Error('Encrypted private field requires configured key');
 const bytes=Buffer.from(value.slice(PREFIX.length),'base64');
 if(bytes.length<29)throw Error('Invalid encrypted private field');
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
 decipher.setAAD(Buffer.from('icebreaker-field-v1:'+playerId+':'+field));
 decipher.setAuthTag(bytes.subarray(12,28));
 return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
}
module.exports={encryptField,decryptField,fieldKey};
