'use strict';
// RFC 6238 TOTP, 6 digits / 30 seconds. For development admin MFA only.
// Provisioning must use an authenticated session; the seed is encrypted at rest.
const crypto=require('node:crypto');
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function encode(bytes){
 let bits=0,value=0,result='';
 for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=ALPHABET[(value>>>(bits-=5))&31];}}
 if(bits)result+=ALPHABET[(value<<(5-bits))&31];
 return result;
}
function decode(text){
 if(typeof text!=='string'||!/^[A-Z2-7]{32}$/.test(text))throw Error('Invalid TOTP secret');
 let bits=0,value=0,bytes=[];
 for(const c of text){value=(value<<5)|ALPHABET.indexOf(c);bits+=5;if(bits>=8){bytes.push((value>>>(bits-=8))&255);}}
 return Buffer.from(bytes);
}
function code(secret,counter){
 const message=Buffer.alloc(8);message.writeBigUInt64BE(BigInt(counter));
 const hmac=crypto.createHmac('sha1',decode(secret)).update(message).digest();
 const offset=hmac[19]&15;
 return String((hmac.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,'0');
}
function match(secret,input,{timeMs=Date.now(),lastCounter=-1}={}){
 if(typeof input!=='string'||!/^\d{6}$/.test(input))return null;
 const counter=Math.floor(timeMs/30000);
 for(let offset=-1;offset<=1;offset++){
  const step=counter+offset;if(step<=lastCounter||step<0)continue;
  const expected=code(secret,step);
  if(crypto.timingSafeEqual(Buffer.from(input),Buffer.from(expected)))return step;
 }
 return null;
}
function generateSecret(){return encode(crypto.randomBytes(20));}
module.exports={generateSecret,code,match,encode,decode};
