'use strict';
// Fictional league email demo. Intentionally NOT a general-purpose MIME parser.
// Real mail must be decoded and authenticated by a separate, sandboxed adapter.
const {validDate}=require('./player-suspensions');
const allowed=new Set(['messageId','from','subject','body','attachment']);
const clean=s=>typeof s==='string'&&s.length>0&&s.length<=500;
function parseMockEmail(mail){
 if(!mail||typeof mail!=='object'||Array.isArray(mail)||Object.keys(mail).some(k=>!allowed.has(k)))throw Error('Invalid mock email');
 if(!clean(mail.messageId)||!clean(mail.from)||!clean(mail.subject)||typeof mail.body!=='string'||mail.body.length>10000)
  throw Error('Missing mock email headers');
 if(mail.from!=='certificates@fictional-foothills.example.invalid'||mail.subject!=='Fictional Foothills League Registration Certificate')
  throw Error('Unsupported mock league sender or subject');
 const fields={};
 for(const line of mail.body.split(/\r?\n/)){
  if(!line.trim())continue;
  const m=/^(Participant Name|Registration Number|Course Code|Completed On|Expires On):\s*(.*?)\s*$/.exec(line);
  if(!m||fields[m[1]]!==undefined)throw Error('Unexpected or duplicate certificate field');
  fields[m[1]]=m[2];
 }
 for(const k of ['Participant Name','Registration Number','Course Code','Completed On'])
  if(!clean(fields[k]))throw Error('Missing '+k);
 if(!/^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,159}$/u.test(fields['Participant Name']))throw Error('Invalid participant name');
 if(!/^[A-Za-z0-9-]{3,100}$/.test(fields['Registration Number'])||!/^[A-Z][A-Z0-9_]{1,79}$/.test(fields['Course Code']))
  throw Error('Invalid registration number or course code');
 if(!validDate(fields['Completed On'])||fields['Expires On']!==undefined&&(!validDate(fields['Expires On'])||fields['Expires On']<fields['Completed On']))
  throw Error('Invalid certificate dates');
 const a=mail.attachment;
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['mime','base64'].includes(k))||
  !['image/png','image/jpeg','application/pdf'].includes(a.mime)||typeof a.base64!=='string'||a.base64.length>1_400_000||
  !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.base64))throw Error('Invalid mock certificate attachment');
 const bytes=Buffer.from(a.base64,'base64');
 const {signatureOk,MAX_BYTES}=require('./encrypted-documents');
 if(bytes.length<8||bytes.length>MAX_BYTES||!signatureOk(a.mime,bytes))throw Error('Invalid certificate image signature or size');
 return {sourceId:mail.messageId,claimedName:fields['Participant Name'],registrationNumber:fields['Registration Number'],
  trainingCode:fields['Course Code'],completedOn:fields['Completed On'],expiresOn:fields['Expires On']||null,
  mime:a.mime,bytes};
}
module.exports={parseMockEmail};
