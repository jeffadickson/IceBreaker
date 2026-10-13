'use strict';
// Private registry: no public endpoints. A player ID survives every season.
// Birth dates, addresses and linked people must never enter public snapshots.
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {validDate}=require('./player-suspensions');
const uuid=()=>crypto.randomUUID();
const good=(x,n=160)=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
function init(db){
 db.exec("PRAGMA foreign_keys=ON;");
 db.exec("CREATE TABLE IF NOT EXISTS player_private_profiles(player_id TEXT PRIMARY KEY REFERENCES players(id),legal_name TEXT NOT NULL,birth_date TEXT NOT NULL,address_json TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL)");
 db.exec("CREATE TABLE IF NOT EXISTS player_related_people(id TEXT PRIMARY KEY,full_name TEXT NOT NULL,email TEXT,phone TEXT)");
 db.exec("CREATE TABLE IF NOT EXISTS player_person_links(player_id TEXT NOT NULL REFERENCES players(id),person_id TEXT NOT NULL REFERENCES player_related_people(id),relationship TEXT NOT NULL CHECK(relationship IN ('PARENT','GUARDIAN','EMERGENCY_CONTACT','OTHER')),PRIMARY KEY(player_id,person_id,relationship))");
 db.exec("CREATE TABLE IF NOT EXISTS season_training_requirements(id TEXT PRIMARY KEY,league_id TEXT NOT NULL REFERENCES leagues(id),season_id TEXT NOT NULL REFERENCES seasons(id),code TEXT NOT NULL,title TEXT NOT NULL,required_by TEXT,blocks_lineup INTEGER NOT NULL CHECK(blocks_lineup IN (0,1)),UNIQUE(league_id,season_id,code))");
 db.exec("CREATE TABLE IF NOT EXISTS player_training_completions(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),requirement_id TEXT NOT NULL REFERENCES season_training_requirements(id),completed_on TEXT NOT NULL,expires_on TEXT,evidence_ref TEXT,verified_by TEXT NOT NULL,verified_at TEXT NOT NULL,revoked_at TEXT,UNIQUE(player_id,requirement_id,completed_on))");
 db.exec("CREATE TABLE IF NOT EXISTS player_membership_history(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),season_id TEXT NOT NULL REFERENCES seasons(id),team_id TEXT NOT NULL REFERENCES teams(id),joined_at TEXT NOT NULL,left_at TEXT,reason TEXT NOT NULL,actor TEXT NOT NULL)");
 db.exec("CREATE INDEX IF NOT EXISTS ix_player_training ON player_training_completions(player_id,requirement_id)");
 db.exec("CREATE INDEX IF NOT EXISTS ix_player_history ON player_membership_history(player_id,season_id)");
 // Old memberships are imported without inventing an enrollment date.
 const insert=db.prepare("INSERT INTO player_membership_history VALUES(?,?,?,?,?,?,?,?)");
 for(const r of db.prepare("SELECT r.* FROM roster_memberships r WHERE NOT EXISTS(SELECT 1 FROM player_membership_history h WHERE h.player_id=r.player_id AND h.team_id=r.team_id AND h.season_id=r.season_id AND h.left_at IS NULL)").all())
  insert.run(uuid(),r.player_id,r.season_id,r.team_id,'LEGACY_IMPORT',null,'LEGACY_IMPORT','migration');
}
function trainingStatus(db,playerId,teamId,date){
 // Compatibility with older isolated pregame test fixtures; production league
 // initialization always creates these tables.
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='season_training_requirements' AND type='table'").get())return [];
 if(!validDate(date))throw Error('Invalid eligibility date');
 const team=db.prepare("SELECT d.season_id,ls.league_id FROM teams t JOIN divisions d ON d.id=t.division_id JOIN league_seasons ls ON ls.season_id=d.season_id WHERE t.id=?").get(teamId);
 if(!team)throw Error('Unknown team');
 return db.prepare("SELECT id,code,title,required_by requiredBy,blocks_lineup blocksLineup FROM season_training_requirements WHERE league_id=? AND season_id=? ORDER BY code").all(team.league_id,team.season_id).map(r=>{
  const row=db.prepare("SELECT completed_on FROM player_training_completions WHERE player_id=? AND requirement_id=? AND revoked_at IS NULL AND completed_on<=? AND (expires_on IS NULL OR expires_on>=?) ORDER BY completed_on DESC LIMIT 1").get(playerId,r.id,date,date);
  const complete=!!row&&(!r.requiredBy||row.completed_on<=r.requiredBy);
  return {code:r.code,title:r.title,complete,blocksLineup:!!r.blocksLineup&&(!r.requiredBy||date>=r.requiredBy),requiredBy:r.requiredBy};
 });
}
class PlayerRegistry{
 constructor(dbPath){this.db=new DatabaseSync(dbPath);init(this.db);}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const x=fn();this.db.exec('COMMIT');return x;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 audit(action,entity,payload,actor){this.db.prepare("INSERT INTO league_audit VALUES(?,?,?,?,?,?)").run(uuid(),new Date().toISOString(),actor,action,entity,JSON.stringify(payload));}
 createPlayer({displayName,legalName,birthDate,address={}},actor){
  if(!good(actor,100)||!good(displayName,120)||!good(legalName)||!validDate(birthDate)||!address||typeof address!=='object'||Array.isArray(address)||JSON.stringify(address).length>2000)throw Error('Invalid private player profile');
  return this.tx(()=>{const playerId=uuid();this.db.prepare("INSERT INTO players(id,display_name,privacy_status) VALUES(?,?,'PRIVATE')").run(playerId,displayName.trim());this.db.prepare("INSERT INTO player_private_profiles VALUES(?,?,?,?,?,?)").run(playerId,legalName.trim(),birthDate,JSON.stringify(address),new Date().toISOString(),actor);this.audit('PLAYER_CREATED',playerId,{privateProfile:true},actor);return {playerId};});
 }
 privateProfile(playerId){
  const p=this.db.prepare("SELECT player_id playerId,legal_name legalName,birth_date birthDate,address_json addressJson FROM player_private_profiles WHERE player_id=?").get(playerId);
  if(!p)throw Error('Private player profile not found');
  return {playerId:p.playerId,legalName:p.legalName,birthDate:p.birthDate,address:JSON.parse(p.addressJson)};
 }
 ageAt(playerId,cutoffDate){
  if(!validDate(cutoffDate))throw Error('Invalid eligibility cutoff date');
  const birth=this.privateProfile(playerId).birthDate;
  return Number(cutoffDate.slice(0,4))-Number(birth.slice(0,4))-(cutoffDate.slice(5)<birth.slice(5)?1:0);
 }
 updatePrivateProfile(playerId,{legalName,birthDate,address={}},actor){
  if(!good(actor,100)||!good(legalName)||!validDate(birthDate)||!address||typeof address!=='object'||Array.isArray(address)||JSON.stringify(address).length>2000)throw Error('Invalid private player profile');
  return this.tx(()=>{
   const result=this.db.prepare('UPDATE player_private_profiles SET legal_name=?,birth_date=?,address_json=?,updated_at=?,updated_by=? WHERE player_id=?')
    .run(legalName.trim(),birthDate,JSON.stringify(address),new Date().toISOString(),actor,playerId);
   if(result.changes!==1)throw Error('Private player profile not found');
   this.audit('PRIVATE_PROFILE_UPDATED',playerId,{privateFieldsChanged:true},actor);
   return {playerId,updated:true};
  });
 }
 linkPerson(playerId,{personId=null,fullName,email=null,phone=null,relationship},actor){
  if(!good(actor,100)||!['PARENT','GUARDIAN','EMERGENCY_CONTACT','OTHER'].includes(relationship)||!this.db.prepare('SELECT 1 FROM players WHERE id=?').get(playerId))throw Error('Invalid person link');
  if(personId===null&&(!good(fullName)||email!==null&&(!good(email,250))||phone!==null&&!good(phone,50)))throw Error('Invalid related person');
  return this.tx(()=>{const relatedId=personId||uuid();if(personId){if(!this.db.prepare('SELECT 1 FROM player_related_people WHERE id=?').get(personId))throw Error('Unknown related person');}
   else this.db.prepare('INSERT INTO player_related_people VALUES(?,?,?,?)').run(relatedId,fullName.trim(),email,phone);
   this.db.prepare('INSERT INTO player_person_links VALUES(?,?,?)').run(playerId,relatedId,relationship);
   this.audit('PERSON_LINKED',playerId,{personId:relatedId,relationship},actor);return {personId:relatedId};});
 }
 relatedPeople(playerId){return this.db.prepare("SELECT p.id personId,p.full_name fullName,p.email,p.phone,l.relationship FROM player_person_links l JOIN player_related_people p ON p.id=l.person_id WHERE l.player_id=?").all(playerId);}
 requireTraining({leagueId,seasonId,code,title,requiredBy=null,blocksLineup=true},actor){
  if(!good(actor,100)||!good(code,60)||!good(title)||typeof blocksLineup!=='boolean'||requiredBy!==null&&!validDate(requiredBy)||!this.db.prepare('SELECT 1 FROM league_seasons WHERE league_id=? AND season_id=?').get(leagueId,seasonId))throw Error('Invalid annual training requirement');
  return this.tx(()=>{const requirementId=uuid();this.db.prepare('INSERT INTO season_training_requirements VALUES(?,?,?,?,?,?,?)').run(requirementId,leagueId,seasonId,code,title,requiredBy,blocksLineup?1:0);this.audit('TRAINING_REQUIRED',requirementId,{leagueId,seasonId,code},actor);return {requirementId};});
 }
 recordTraining({playerId,requirementId,completedOn,expiresOn=null,evidenceRef=null},actor){
  if(!good(actor,100)||!validDate(completedOn)||expiresOn!==null&&(!validDate(expiresOn)||expiresOn<completedOn)||evidenceRef!==null&&!good(evidenceRef,250)||!this.db.prepare('SELECT 1 FROM players WHERE id=?').get(playerId))throw Error('Invalid training record');
  return this.tx(()=>{const completionId=uuid();this.db.prepare('INSERT INTO player_training_completions VALUES(?,?,?,?,?,?,?,?,?)').run(completionId,playerId,requirementId,completedOn,expiresOn,evidenceRef,actor,new Date().toISOString(),null);this.audit('TRAINING_VERIFIED',playerId,{requirementId,completionId},actor);return {completionId};});
 }
 trainingStatus(playerId,teamId,date){return trainingStatus(this.db,playerId,teamId,date);}
 enroll(playerId,teamId,{jersey,position,reason='SEASON_ENROLLMENT'},actor){
  if(!good(actor,100)||!good(playerId,100)||!Number.isInteger(jersey)||jersey<0||jersey>99||!['F','D','G','C','LW','RW','LD','RD'].includes(position)||!good(reason,150))throw Error('Invalid enrollment');
  const team=this.db.prepare("SELECT d.season_id,ls.league_id FROM teams t JOIN divisions d ON d.id=t.division_id JOIN league_seasons ls ON ls.season_id=d.season_id WHERE t.id=?").get(teamId);
  if(!team||!this.db.prepare('SELECT 1 FROM players WHERE id=?').get(playerId))throw Error('Unknown player or team');
  return this.tx(()=>{
   const previous=this.db.prepare("SELECT r.team_id FROM roster_memberships r JOIN teams t ON t.id=r.team_id JOIN divisions d ON d.id=t.division_id JOIN league_seasons ls ON ls.season_id=d.season_id WHERE r.player_id=? AND r.season_id=? AND ls.league_id=?").all(playerId,team.season_id,team.league_id);
   if(previous.some(r=>r.team_id===teamId))throw Error('Already on this team');
   for(const old of previous){
    // A confirmed active lineup requires an explicit administrator amendment.
    const confirmations=this.db.prepare("SELECT c.player_ids_json FROM game_roster_confirmations c JOIN games g ON g.id=c.game_id WHERE c.team_id=? AND g.status IN ('scheduled','live')").all(old.team_id);
    if(confirmations.some(c=>JSON.parse(c.player_ids_json).includes(playerId)))throw Error('Confirmed game lineup must be amended before transfer');
   }
   const now=new Date().toISOString();
   for(const old of previous){
    this.db.prepare('DELETE FROM roster_memberships WHERE season_id=? AND team_id=? AND player_id=?').run(team.season_id,old.team_id,playerId);
    this.db.prepare('UPDATE player_membership_history SET left_at=? WHERE player_id=? AND season_id=? AND team_id=? AND left_at IS NULL').run(now,playerId,team.season_id,old.team_id);
   }
   this.db.prepare('INSERT INTO roster_memberships VALUES(?,?,?,?,?)').run(team.season_id,teamId,playerId,jersey,position);
   this.db.prepare('INSERT INTO player_membership_history VALUES(?,?,?,?,?,?,?,?)').run(uuid(),playerId,team.season_id,teamId,now,null,reason,actor);
   this.audit('PLAYER_ENROLLED',playerId,{seasonId:team.season_id,teamId,previousTeams:previous.map(x=>x.team_id)},actor);
   return {playerId,teamId,seasonId:team.season_id,previousTeams:previous.map(x=>x.team_id)};
  });
 }
 history(playerId){return this.db.prepare('SELECT season_id seasonId,team_id teamId,joined_at joinedAt,left_at leftAt,reason FROM player_membership_history WHERE player_id=? ORDER BY season_id,joined_at').all(playerId);}
 close(){this.db.close();}
}
module.exports={PlayerRegistry,initPlayerRegistry:init,trainingStatus};
