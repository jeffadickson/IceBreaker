'use strict';
// Development-only, bounded in-memory login throttling. Never use proxy
// forwarding headers for identity; only the directly connected socket.
// Production requires a shared/distributed limiter and monitored lockout policy.
const crypto=require('node:crypto');
class LoginThrottle {
 constructor({maxFailures=5,windowMs=5*60_000,maxEntries=4096,clock=()=>Date.now()}={}){
  this.maxFailures=maxFailures;this.windowMs=windowMs;this.maxEntries=maxEntries;this.clock=clock;
  this.entries=new Map();this.salt=crypto.randomBytes(32);
 }
 keys(scope,ip,principal){
  const identity=crypto.createHmac('sha256',this.salt)
   .update(String(principal||'').trim().toLowerCase()).digest('hex');
  return [scope+':ip:'+String(ip||'unknown'),scope+':principal:'+identity];
 }
 record(key,now){
  let state=this.entries.get(key);
  if(!state||now-state.since>=this.windowMs)state={since:now,count:0};
  state.count++;
  this.entries.delete(key);this.entries.set(key,state);
  while(this.entries.size>this.maxEntries)this.entries.delete(this.entries.keys().next().value);
 }
 allowed(scope,ip,principal){
  const now=this.clock();
  return this.keys(scope,ip,principal).every(key=>{
   const x=this.entries.get(key);
   if(!x)return true;
   if(now-x.since>=this.windowMs){this.entries.delete(key);return true;}
   return x.count<this.maxFailures;
  });
 }
 failure(scope,ip,principal){
  const now=this.clock();for(const key of this.keys(scope,ip,principal))this.record(key,now);
 }
 success(scope,ip,principal){
  for(const key of this.keys(scope,ip,principal))this.entries.delete(key);
 }
}
module.exports={LoginThrottle};
