'use strict';
// Parent identity subsystem. Google OAuth 2.0/OIDC uses authorization-code + PKCE.
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { URL, URLSearchParams } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const rand = () => crypto.randomBytes(32).toString('base64url');
const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const eq=(a,b)=>a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const now=()=>Date.now();
function parseCookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split(/=(.*)/s).slice(0,2)).filter(a=>a.length===2));}
function json(res,status,value,cookie){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})});res.end(JSON.stringify(value));}
function cookieFor(session,secure){return `icebreaker_parent=${session}; HttpOnly; Path=/; SameSite=Lax; Max-Age=1209600${secure?'; Secure':''}`;}
function cookieClear(secure){return `icebreaker_parent=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`;}
function normalizeEmail(v){const e=String(v||'').trim().toLowerCase();if(e.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw Error('Valid email required');return e;}
function makePassword(p){if(typeof p!=='string'||p.length<12||p.length>256)throw Error('Password must contain 12 to 256 characters');const salt=crypto.randomBytes(16);return salt.toString('hex')+':'+crypto.scryptSync(p,salt,64).toString('hex');}
function checkPassword(p,stored){try{const [salt,expected]=stored.split(':');return eq(crypto.scryptSync(p,Buffer.from(salt,'hex'),64).toString('hex'),expected);}catch{return false;}}
async function getBody(req){let s='';for await(const c of req){s+=c;if(s.length>16384)throw Error('Request too large');}try{return JSON.parse(s);}catch{throw Error('Invalid JSON');}}
function createParentAuth({dbPath,baseUrl=process.env.ICEBREAKER_PUBLIC_URL||'http://127.0.0.1:8090',googleClientId=process.env.GOOGLE_CLIENT_ID||'',googleClientSecret=process.env.GOOGLE_CLIENT_SECRET||'',onEmail}={}){
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS parent_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT,email_verified INTEGER NOT NULL DEFAULT 0,display_name TEXT NOT NULL DEFAULT '',created_ms INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS parent_identities(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES parent_users(id),PRIMARY KEY(provider,subject));
 CREATE TABLE IF NOT EXISTS parent_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES parent_users(id),expires_ms INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS parent_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES parent_users(id),purpose TEXT NOT NULL,expires_ms INTEGER NOT NULL,used_ms INTEGER);
 CREATE TABLE IF NOT EXISTS parent_favorites(user_id TEXT NOT NULL REFERENCES parent_users(id),kind TEXT NOT NULL,entity_id TEXT NOT NULL,PRIMARY KEY(user_id,kind,entity_id));
 CREATE TABLE IF NOT EXISTS parent_preferences(user_id TEXT PRIMARY KEY REFERENCES parent_users(id),email_mode TEXT NOT NULL DEFAULT 'certified',include_player_stats INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS parent_mail_outbox(id TEXT PRIMARY KEY,recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,created_ms INTEGER NOT NULL,delivered_ms INTEGER);
 CREATE TABLE IF NOT EXISTS parent_oauth_flows(state_hash TEXT PRIMARY KEY,code_verifier TEXT NOT NULL,nonce TEXT NOT NULL,expires_ms INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS parent_auth_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_ms INTEGER NOT NULL);`);
 const base=new URL(baseUrl);if(base.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(base.hostname))throw Error('Parent authentication requires HTTPS outside loopback');
 const secure=base.protocol==='https:';
 const userById=db.prepare('SELECT id,email,email_verified,display_name FROM parent_users WHERE id=?');
 function session(req){const t=parseCookies(req).icebreaker_parent;if(!t||t.length>128)return null;const r=db.prepare('SELECT user_id FROM parent_sessions WHERE token_hash=? AND expires_ms>?').get(hash(t),now());return r?userById.get(r.user_id):null;}
 function sendSession(res,userId){const token=rand();db.prepare('INSERT INTO parent_sessions VALUES(?,?,?)').run(hash(token),userId,now()+14*86400000);return cookieFor(token,secure);}
 function throttle(req,email){const key=hash(`${req.socket.remoteAddress||'local'}|${email}`);const t=now();const r=db.prepare('SELECT count,reset_ms FROM parent_auth_attempts WHERE key=?').get(key);const n=r&&r.reset_ms>t?r.count:0;if(n>=8)throw Object.assign(Error('Too many attempts; try later'),{status:429});db.prepare('INSERT INTO parent_auth_attempts VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,reset_ms=excluded.reset_ms').run(key,n+1,t+15*60000);}
 function dispatchEmail(to,subject,body){const id=crypto.randomUUID();db.prepare('INSERT INTO parent_mail_outbox VALUES(?,?,?,?,?,NULL)').run(id,to,subject,body,now());if(onEmail)onEmail({id,to,subject,body});}
 function sendVerification(userId,email){const token=rand();db.prepare('INSERT INTO parent_tokens VALUES(?,?,?,?,NULL)').run(hash(token),userId,'verify',now()+24*3600000);dispatchEmail(email,'Verify your IceBreaker account',`Verify your email by opening: ${new URL('/parent.html?verify='+encodeURIComponent(token),base)}`);}
 function safeUser(u){return {id:u.id,email:u.email,emailVerified:!!u.email_verified,displayName:u.display_name};}
 function redirect(res,pathOrUrl,cookie){res.writeHead(302,{'Location':pathOrUrl,'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})});res.end();}
 async function googleVerify(jwt,nonce){const parts=jwt.split('.');if(parts.length!==3)throw Error('Malformed Google ID token');const header=JSON.parse(Buffer.from(parts[0],'base64url').toString());const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString());if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('Unsupported ID token algorithm');const keys=await (await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(8000)})).json();const jwk=keys.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk||!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw Error('Invalid Google ID token signature');if(!['https://accounts.google.com','accounts.google.com'].includes(payload.iss)||payload.aud!==googleClientId||payload.nonce!==nonce||!Number.isFinite(payload.exp)||payload.exp*1000<=now()||!payload.sub)throw Error('Invalid Google ID token claims');return payload;}
 async function handle(req,res,pathname,url){
  try{
   if(!['GET','HEAD','OPTIONS'].includes(req.method)){const origin=req.headers.origin;if(origin&&origin!==base.origin)return json(res,403,{error:'Cross-origin request rejected'});}
   if(req.method==='POST'&&pathname==='/api/parent/register'){
    const v=await getBody(req),email=normalizeEmail(v.email);throttle(req,email);const p=makePassword(v.password);const id=crypto.randomUUID();try{db.prepare('INSERT INTO parent_users(id,email,password_hash,created_ms) VALUES(?,?,?,?)').run(id,email,p,now());}catch(e){if(String(e).includes('UNIQUE'))return json(res,409,{error:'Account already exists'});throw e;}sendVerification(id,email);return json(res,201,{message:'Account created. Check your email to verify it.'});
   }
   if(req.method==='POST'&&pathname==='/api/parent/verify'){
    const v=await getBody(req),h=hash(String(v.token||''));const r=db.prepare("SELECT user_id FROM parent_tokens WHERE token_hash=? AND purpose='verify' AND used_ms IS NULL AND expires_ms>?").get(h,now());if(!r)return json(res,400,{error:'Verification link invalid or expired'});db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE parent_tokens SET used_ms=? WHERE token_hash=?').run(now(),h);db.prepare('UPDATE parent_users SET email_verified=1 WHERE id=?').run(r.user_id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json(res,200,{verified:true});
   }
   if(req.method==='POST'&&pathname==='/api/parent/resend-verification'){
    const v=await getBody(req),email=normalizeEmail(v.email);throttle(req,email);const r=db.prepare('SELECT id,email,email_verified FROM parent_users WHERE email=?').get(email);if(r&&!r.email_verified)sendVerification(r.id,email);return json(res,200,{message:'If an unverified account exists, a verification message has been queued.'});
   }
   if(req.method==='POST'&&pathname==='/api/parent/login'){
    const v=await getBody(req),email=normalizeEmail(v.email);throttle(req,email);const r=db.prepare('SELECT * FROM parent_users WHERE email=?').get(email);if(!r||!r.password_hash||!checkPassword(v.password,r.password_hash))return json(res,401,{error:'Invalid credentials'});if(!r.email_verified)return json(res,403,{error:'Verify your email before signing in'});return json(res,200,{user:safeUser(r)},sendSession(res,r.id));
   }
   if(req.method==='POST'&&pathname==='/api/parent/logout'){
    const t=parseCookies(req).icebreaker_parent;if(t)db.prepare('DELETE FROM parent_sessions WHERE token_hash=?').run(hash(t));return json(res,200,{loggedOut:true},cookieClear(secure));
   }
   if(req.method==='GET'&&pathname==='/api/parent/google/start'){
    if(!googleClientId||!googleClientSecret)return json(res,503,{error:'Google sign-in has not been configured'});
    const state=rand(),verifier=rand(),nonce=rand(),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');db.prepare('INSERT INTO parent_oauth_flows VALUES(?,?,?,?)').run(hash(state),verifier,nonce,now()+600000);
    const q=new URLSearchParams({client_id:googleClientId,redirect_uri:new URL('/api/parent/google/callback',base).href,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'});return redirect(res,'https://accounts.google.com/o/oauth2/v2/auth?'+q,`icebreaker_google_state=${hash(state)}; HttpOnly; Path=/api/parent/google/callback; SameSite=Lax; Max-Age=600${secure?'; Secure':''}`);
   }
   if(req.method==='GET'&&pathname==='/api/parent/google/callback'){
    const state=url.searchParams.get('state'),code=url.searchParams.get('code');if(!state||!code)return json(res,400,{error:'Google authorization incomplete'});
    if(parseCookies(req).icebreaker_google_state!==hash(state))return json(res,400,{error:'Google login browser state mismatch'});const flow=db.prepare('SELECT * FROM parent_oauth_flows WHERE state_hash=? AND expires_ms>?').get(hash(state),now());if(!flow)return json(res,400,{error:'Google login expired'});db.prepare('DELETE FROM parent_oauth_flows WHERE state_hash=?').run(hash(state));
    const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:googleClientId,client_secret:googleClientSecret,redirect_uri:new URL('/api/parent/google/callback',base).href,code_verifier:flow.code_verifier}),signal:AbortSignal.timeout(8000)});if(!tokenRes.ok)throw Error('Google token exchange failed');const token=await tokenRes.json();const p=await googleVerify(token.id_token,flow.nonce);if(p.email_verified!==true)throw Error('Google account email not verified');const email=normalizeEmail(p.email);
    let identity=db.prepare("SELECT user_id FROM parent_identities WHERE provider='google' AND subject=?").get(p.sub);let userId;if(identity){userId=identity.user_id;}else{
     // Never automatically link an existing password account by email; account takeover risk.
     if(db.prepare('SELECT id FROM parent_users WHERE email=?').get(email))return redirect(res,'/parent.html?error=account_exists');
     userId=crypto.randomUUID();db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO parent_users(id,email,email_verified,display_name,created_ms) VALUES(?,?,1,?,?)').run(userId,email,String(p.name||'').slice(0,120),now());db.prepare('INSERT INTO parent_identities VALUES(?,?,?)').run('google',p.sub,userId);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    }return redirect(res,'/parent.html',sendSession(res,userId));
   }
   if(!pathname.startsWith('/api/parent/'))return false;
   const user=session(req);if(!user)return json(res,401,{error:'Parent sign-in required'});
   if(req.method==='GET'&&pathname==='/api/parent/me')return json(res,200,{user:safeUser(user),favorites:db.prepare('SELECT kind,entity_id AS entityId FROM parent_favorites WHERE user_id=? ORDER BY kind,entity_id').all(user.id),preferences:db.prepare('SELECT email_mode AS emailMode,include_player_stats AS includePlayerStats FROM parent_preferences WHERE user_id=?').get(user.id)||{emailMode:'certified',includePlayerStats:1}});
   if(req.method==='POST'&&pathname==='/api/parent/favorites'){
    const v=await getBody(req);if(!['team','player'].includes(v.kind)||typeof v.entityId!=='string'||!/^[-\w]{1,100}$/.test(v.entityId))return json(res,400,{error:'Invalid favorite'});db.prepare('INSERT OR IGNORE INTO parent_favorites VALUES(?,?,?)').run(user.id,v.kind,v.entityId);return json(res,200,{saved:true});
   }
   if(req.method==='DELETE'&&pathname==='/api/parent/favorites'){
    const v=await getBody(req);db.prepare('DELETE FROM parent_favorites WHERE user_id=? AND kind=? AND entity_id=?').run(user.id,v.kind,v.entityId);return json(res,200,{removed:true});
   }
   if(req.method==='PUT'&&pathname==='/api/parent/preferences'){
    const v=await getBody(req);if(!['certified','daily','none'].includes(v.emailMode)||typeof v.includePlayerStats!=='boolean')return json(res,400,{error:'Invalid preferences'});db.prepare('INSERT INTO parent_preferences VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET email_mode=excluded.email_mode,include_player_stats=excluded.include_player_stats').run(user.id,v.emailMode,Number(v.includePlayerStats));return json(res,200,{updated:true});
   }
   return json(res,405,{error:'Method not allowed'});
  }catch(e){return json(res,e.status||400,{error:e.message});}
 }
 return {handle,close:()=>db.close(),_db:db};
}
module.exports={createParentAuth};
