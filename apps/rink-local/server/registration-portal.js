'use strict';
// Development-only private registrar service. Never expose this to public internet
// or load real minors' PII before encryption, MFA and consent verification.
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {PlayerRegistry}=require('./player-registry');
const uid=()=>crypto.randomUUID(),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const good=(x,n=160)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
function secret(p){if(!good(p,256)||p.length<12)throw Error('Password must be at least 12 characters');const salt=crypto.randomBytes(16);return salt.toString('hex')+':'+crypto.scryptSync(p,salt,64).toString('hex');}
function verify(p,h){try{const [s,v]=h.split(':');return crypto.timingSafeEqual(crypto.scryptSync(p,Buffer.from(s,'hex'),64),Buffer.from(v,'hex'));}catch{return false;}}
class RegistrationPortal{
 constructor(file){
  this.db=new DatabaseSync(file);this.db.exec('PRAGMA foreign_keys=ON');
  this.registry=Object.create(PlayerRegistry.prototype);this.registry.db=this.db;
  this.db.exec([
   'CREATE TABLE IF NOT EXISTS registration_clubs(id TEXT PRIMARY KEY,name TEXT NOT NULL,league_id TEXT NOT NULL REFERENCES leagues(id))',
   'CREATE TABLE IF NOT EXISTS registration_club_teams(club_id TEXT NOT NULL REFERENCES registration_clubs(id),team_id TEXT NOT NULL REFERENCES teams(id),PRIMARY KEY(club_id,team_id),UNIQUE(team_id))',
   'CREATE TABLE IF NOT EXISTS registration_player_clubs(club_id TEXT NOT NULL REFERENCES registration_clubs(id),player_id TEXT NOT NULL REFERENCES players(id),created_at TEXT NOT NULL,PRIMARY KEY(club_id,player_id))',
   "CREATE TABLE IF NOT EXISTS registration_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('CLUB_REGISTRAR','LEAGUE_ADMIN')),scope_id TEXT NOT NULL,created_at TEXT NOT NULL)",
   'CREATE TABLE IF NOT EXISTS registration_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES registration_users(id),expires_ms INTEGER NOT NULL)',
   "CREATE TABLE IF NOT EXISTS registration_requests(id TEXT PRIMARY KEY,club_id TEXT NOT NULL REFERENCES registration_clubs(id),league_id TEXT NOT NULL REFERENCES leagues(id),player_id TEXT NOT NULL REFERENCES players(id),team_id TEXT NOT NULL REFERENCES teams(id),jersey INTEGER NOT NULL,position TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('SUBMITTED','APPROVED','REJECTED')),created_by TEXT NOT NULL,created_at TEXT NOT NULL,decided_by TEXT,decided_at TEXT,decision_reason TEXT)",
   "CREATE UNIQUE INDEX IF NOT EXISTS registration_open_request ON registration_requests(club_id,player_id,team_id) WHERE status='SUBMITTED'"
  ].join(';')+';');
 }
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const x=fn();this.db.exec('COMMIT');return x;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 audit(action,entity,actor,details={}){this.db.prepare('INSERT INTO league_audit VALUES(?,?,?,?,?,?)').run(uid(),new Date().toISOString(),actor,action,entity,JSON.stringify(details));}
 club(id){const c=this.db.prepare('SELECT * FROM registration_clubs WHERE id=?').get(id);if(!c)throw Error('Unknown club');return c;}
 team(id){const t=this.db.prepare('SELECT t.id,t.name,d.season_id seasonId,ls.league_id leagueId FROM teams t JOIN divisions d ON d.id=t.division_id JOIN league_seasons ls ON ls.season_id=d.season_id WHERE t.id=?').get(id);if(!t)throw Error('Unknown team');return t;}
 createClub({id,name,leagueId}){
  if(!good(id,80)||!/^[-\w]+$/.test(id)||!good(name)||!this.db.prepare('SELECT 1 FROM leagues WHERE id=?').get(leagueId))throw Error('Invalid club');
  this.db.prepare('INSERT INTO registration_clubs VALUES(?,?,?)').run(id,name.trim(),leagueId);return {id,name,leagueId};
 }
 assignTeam(clubId,teamId){const c=this.club(clubId),t=this.team(teamId);if(c.league_id!==t.leagueId)throw Error('Team outside league');this.db.prepare('INSERT INTO registration_club_teams VALUES(?,?)').run(clubId,teamId);return {clubId,teamId};}
 createUser({email,password,role,scopeId}){
  if(!good(email,254)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!['CLUB_REGISTRAR','LEAGUE_ADMIN'].includes(role))throw Error('Invalid account');
  if(role==='CLUB_REGISTRAR')this.club(scopeId);else if(!this.db.prepare('SELECT 1 FROM leagues WHERE id=?').get(scopeId))throw Error('Unknown league');
  const userId=uid();this.db.prepare('INSERT INTO registration_users VALUES(?,?,?,?,?,?)').run(userId,email.toLowerCase(),secret(password),role,scopeId,new Date().toISOString());return {userId,role,scopeId};
 }
 login(email,password){
  const u=this.db.prepare('SELECT * FROM registration_users WHERE email=?').get(String(email||'').toLowerCase());
  if(!u||!verify(password,u.password_hash))throw Error('Invalid credentials');
  const token=crypto.randomBytes(32).toString('base64url');this.db.prepare('INSERT INTO registration_sessions VALUES(?,?,?)').run(hash(token),u.id,Date.now()+8*3600_000);
  return {token,role:u.role,scopeId:u.scope_id,expiresInSeconds:28800};
 }
 authenticate(token){
  if(typeof token!=='string'||token.length<30)throw Error('Registration sign-in required');
  const u=this.db.prepare('SELECT u.id,u.role,u.scope_id scopeId FROM registration_sessions s JOIN registration_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_ms>?').get(hash(token),Date.now());
  if(!u)throw Error('Registration sign-in required');return u;
 }
 requireClub(u,id){if(u.role!=='CLUB_REGISTRAR'||u.scopeId!==id)throw Error('Club registrar access denied');}
 requireLeague(u,id){if(u.role!=='LEAGUE_ADMIN'||u.scopeId!==id)throw Error('League administrator access denied');}
 owns(clubId,playerId){return !!this.db.prepare('SELECT 1 FROM registration_player_clubs WHERE club_id=? AND player_id=?').get(clubId,playerId);}
 canRead(u,playerId){return u.role==='CLUB_REGISTRAR'?this.owns(u.scopeId,playerId):u.role==='LEAGUE_ADMIN'&&!!this.db.prepare('SELECT 1 FROM registration_player_clubs pc JOIN registration_clubs c ON c.id=pc.club_id WHERE pc.player_id=? AND c.league_id=?').get(playerId,u.scopeId);}
 teams(u){return u.role==='CLUB_REGISTRAR'?this.db.prepare('SELECT t.id,t.name,d.season_id seasonId FROM registration_club_teams ct JOIN teams t ON t.id=ct.team_id JOIN divisions d ON d.id=t.division_id WHERE ct.club_id=? ORDER BY d.season_id,t.name').all(u.scopeId):this.db.prepare('SELECT t.id,t.name,d.season_id seasonId FROM teams t JOIN divisions d ON d.id=t.division_id JOIN league_seasons ls ON ls.season_id=d.season_id WHERE ls.league_id=? ORDER BY d.season_id,t.name').all(u.scopeId);}
 players(u){return u.role==='CLUB_REGISTRAR'?this.db.prepare('SELECT p.id,p.display_name displayName FROM registration_player_clubs pc JOIN players p ON p.id=pc.player_id WHERE pc.club_id=? ORDER BY p.display_name').all(u.scopeId):this.db.prepare('SELECT DISTINCT p.id,p.display_name displayName FROM registration_player_clubs pc JOIN registration_clubs c ON c.id=pc.club_id JOIN players p ON p.id=pc.player_id WHERE c.league_id=? ORDER BY p.display_name').all(u.scopeId);}
 createPlayer(u,input){this.requireClub(u,u.scopeId);return this.tx(()=>{const r=this.registry.createPlayer(input,u.id,{withinTransaction:true});this.db.prepare('INSERT INTO registration_player_clubs VALUES(?,?,?)').run(u.scopeId,r.playerId,new Date().toISOString());this.audit('CLUB_PLAYER_CREATED',r.playerId,u.id,{clubId:u.scopeId});return r;});}
 profile(u,playerId){if(!this.canRead(u,playerId))throw Error('Player outside authorized scope');return {profile:this.registry.privateProfile(playerId),relatedPeople:this.registry.relatedPeople(playerId),history:this.registry.history(playerId)};}
 linkExisting(u,clubId,playerId){const c=this.club(clubId);this.requireLeague(u,c.league_id);if(!this.db.prepare('SELECT 1 FROM players WHERE id=?').get(playerId))throw Error('Unknown player');return this.tx(()=>{this.db.prepare('INSERT INTO registration_player_clubs VALUES(?,?,?)').run(clubId,playerId,new Date().toISOString());this.audit('CLUB_PLAYER_LINKED',playerId,u.id,{clubId});return {clubId,playerId};});}
 submit(u,{playerId,teamId,jersey,position}){
  this.requireClub(u,u.scopeId);
  if(!this.owns(u.scopeId,playerId))throw Error('Player outside club scope');
  if(!this.db.prepare('SELECT 1 FROM registration_club_teams WHERE club_id=? AND team_id=?').get(u.scopeId,teamId))throw Error('Team outside club scope');
  if(!Number.isInteger(jersey)||jersey<0||jersey>99||!['F','D','G','C','LW','RW','LD','RD'].includes(position))throw Error('Invalid roster details');
  return this.tx(()=>{const requestId=uid(),club=this.club(u.scopeId),team=this.team(teamId);
   this.db.prepare("INSERT INTO registration_requests(id,club_id,league_id,player_id,team_id,jersey,position,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,'SUBMITTED',?,?)").run(requestId,u.scopeId,club.league_id,playerId,teamId,jersey,position,u.id,new Date().toISOString());
   this.audit('REGISTRATION_SUBMITTED',requestId,u.id,{playerId,teamId,seasonId:team.seasonId});return {requestId,status:'SUBMITTED'};
  });
 }
 requests(u){const field=u.role==='CLUB_REGISTRAR'?'club_id':'league_id';return this.db.prepare('SELECT r.id requestId,r.club_id clubId,r.player_id playerId,p.display_name displayName,r.team_id teamId,r.jersey,r.position,r.status,r.created_at createdAt,r.decision_reason decisionReason FROM registration_requests r JOIN players p ON p.id=r.player_id WHERE r.'+field+'=? ORDER BY r.created_at DESC,r.id DESC LIMIT 500').all(u.scopeId);}
 decide(u,requestId,{decision,reason}){
  if(!['APPROVED','REJECTED'].includes(decision)||!good(reason,300))throw Error('Decision and reason required');
  return this.tx(()=>{const r=this.db.prepare('SELECT * FROM registration_requests WHERE id=?').get(requestId);if(!r)throw Error('Unknown request');this.requireLeague(u,r.league_id);if(r.status!=='SUBMITTED')throw Error('Request already decided');
   if(decision==='APPROVED'){
    if(!this.db.prepare('SELECT 1 FROM registration_club_teams WHERE club_id=? AND team_id=?').get(r.club_id,r.team_id)||!this.owns(r.club_id,r.player_id))throw Error('Club scope changed');
    this.registry.enroll(r.player_id,r.team_id,{jersey:r.jersey,position:r.position,reason:'LEAGUE_APPROVED'},u.id,{withinTransaction:true});
   }
   this.db.prepare('UPDATE registration_requests SET status=?,decided_by=?,decided_at=?,decision_reason=? WHERE id=?').run(decision,u.id,new Date().toISOString(),reason.trim(),requestId);
   this.audit('REGISTRATION_'+decision,requestId,u.id,{playerId:r.player_id,teamId:r.team_id});return {requestId,status:decision};
  });
 }
 preview(u,rows){
  this.requireClub(u,u.scopeId);if(!Array.isArray(rows)||rows.length>250)throw Error('Preview supports at most 250 rows');
  const seen=new Set();return rows.map((row,index)=>{const playerId=String(row?.playerId||'').trim(),teamId=String(row?.teamId||'').trim(),jersey=Number(row?.jersey),position=String(row?.position||'').trim().toUpperCase(),errors=[];
   if(!this.owns(u.scopeId,playerId))errors.push('Unknown or unauthorized player ID');
   if(!this.db.prepare('SELECT 1 FROM registration_club_teams WHERE club_id=? AND team_id=?').get(u.scopeId,teamId))errors.push('Team outside club scope');
   if(!Number.isInteger(jersey)||jersey<0||jersey>99)errors.push('Invalid jersey');
   if(!['F','D','G','C','LW','RW','LD','RD'].includes(position))errors.push('Invalid position');
   const key=playerId+':'+teamId;if(seen.has(key))errors.push('Duplicate player/team');seen.add(key);
   return {row:index+1,playerId,teamId,jersey,position,valid:errors.length===0,errors};
  });
 }
 close(){this.db.close();}
}
module.exports={RegistrationPortal};
