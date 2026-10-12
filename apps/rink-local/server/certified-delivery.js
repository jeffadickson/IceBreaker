'use strict';
// Rink-local delivery adapter. Real central deployment replaces the database
// adapter with authenticated central events; no email is sent from this module.
const crypto=require('node:crypto');
class CertifiedDelivery {
 constructor({db,workflow,certification,leagueStore,leagueGameId}){Object.assign(this,{db,workflow,certification,leagueStore,leagueGameId});
  db.exec(`CREATE TABLE IF NOT EXISTS certified_report_recipients(delivery_key TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(delivery_key,user_id));`);
 }
 publishLeague(row){
  if(!this.leagueGameId)throw Error('League game binding required for certified publication');
  const game=this.leagueStore.db.prepare('SELECT * FROM games WHERE id=?').get(this.leagueGameId);
  if(!game)throw Error('Bound league game does not exist');
  const rev=this.certification.get(row.scoresheet_revision);
  if(!rev||rev.status!=='CERTIFIED'||rev.digest!==row.document_digest)throw Error('Certified digest mismatch');
  // Resolve jersey numbers against permanent player IDs and the bound fixture;
  // unresolved, duplicate and ambiguous roster lookups are fatal.
  const season=this.leagueStore.db.prepare('SELECT season_id FROM divisions WHERE id=?').get(game.division_id)?.season_id;
  if(!season)throw Error('League division has no season');
  const roster=this.leagueStore.db.prepare('SELECT team_id,player_id,jersey FROM roster_memberships WHERE season_id=? AND team_id IN (?,?)').all(season,game.home_team_id,game.away_team_id);
  function resolved(side,value){if(value==='None')return null;if(value==='TBD'||value===undefined||value===null)throw Error('Unresolved certified attribution');const team=side==='home'?game.home_team_id:game.away_team_id;const rows=roster.filter(x=>x.team_id===team&&String(x.jersey)===String(value));if(rows.length!==1)throw Error('Ambiguous or unknown player number '+value);return rows[0].player_id;}
  const goals=rev.document.goals.map(x=>({side:x.team,scorerId:resolved(x.team,x.details.scorer),assist1Id:resolved(x.team,x.details.assist1),assist2Id:resolved(x.team,x.details.assist2)}));
  const preexisting=this.leagueStore.db.prepare('SELECT * FROM games WHERE id=?').get(this.leagueGameId);
  if(preexisting.status==='final'){
    if(preexisting.certified_by===`scoresheet:${rev.revision}:${rev.digest}`)return {id:this.leagueGameId,status:'final',version:preexisting.version,recoveredAcknowledgment:true};
    throw Error('Existing final result requires explicit certified-revision amendment');
  }
  return this.leagueStore.certifyGame(this.leagueGameId,{homeScore:rev.document.score.home,awayScore:rev.document.score.away,goals,expectedVersion:game.version,actor:`scoresheet:${rev.revision}:${rev.digest}`});
 }
 queueParentReports(row){
  if(!this.leagueGameId)throw Error('League game binding required for parent report delivery');
  const published=this.db.prepare("SELECT status FROM certification_delivery_outbox WHERE game_id=? AND scoresheet_revision=? AND type='LEAGUE_PUBLICATION' AND document_digest=?").get(row.game_id,row.scoresheet_revision,row.document_digest);
  if(published?.status!=='DELIVERED')throw Error('League publication must complete before parent notifications');
  const game=this.leagueStore.db.prepare('SELECT home_team_id,away_team_id FROM games WHERE id=?').get(this.leagueGameId);
  if(!game)throw Error('Unknown bound fixture');
  const parents=this.db.prepare(`SELECT DISTINCT u.id,u.email FROM parent_users u JOIN parent_favorites f ON f.user_id=u.id LEFT JOIN parent_preferences p ON p.user_id=u.id WHERE u.email_verified=1 AND f.kind='team' AND f.entity_id IN (?,?) AND COALESCE(p.email_mode,'certified')='certified'`).all(game.home_team_id,game.away_team_id);
  let queued=0;this.db.exec('BEGIN IMMEDIATE');try{
  for(const p of parents){const insert=this.db.prepare('INSERT OR IGNORE INTO certified_report_recipients(delivery_key,user_id) VALUES(?,?)').run(row.delivery_key,p.id);if(!insert.changes)continue;
   const subject='IceBreaker certified game result';
   const rev=this.certification.get(row.scoresheet_revision);
   const score=rev.document.score,shots=rev.document.shots;
   const body=`Certified game result: ${this.leagueGameId}\nFinal: ${score.home}–${score.away}\nShots: ${shots.home}–${shots.away}\nRecorded goals: ${rev.document.goals.length}; penalties: ${rev.document.penalties.length}\nScoresheet revision: ${row.scoresheet_revision}\nReview detailed, permission-controlled scoring and penalty information in IceBreaker. This message contains no private youth player identifiers.`;
   this.db.prepare('INSERT INTO parent_mail_outbox VALUES(?,?,?,?,?,NULL)').run(crypto.randomUUID(),p.email,subject,body,Date.now());queued++;
  }
  this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  return {queued,transport:'PENDING_CONFIGURATION'};
 }
 run(){let delivered=0,blocked=0;const rows=this.db.prepare("SELECT * FROM certification_delivery_outbox WHERE game_id=? AND status='PENDING' ORDER BY created_at,type").all(this.workflow.gameId);
  for(const r of rows){try{
   // One SQLite file, separate connections: never run nested cross-connection transactions.
   const outcome=r.type==='LEAGUE_PUBLICATION'?this.publishLeague(r):this.queueParentReports(r);
   this.db.prepare("UPDATE certification_delivery_outbox SET status='DELIVERED',delivered_at=?,details=? WHERE delivery_key=? AND status='PENDING'").run(new Date().toISOString(),JSON.stringify(outcome),r.delivery_key);delivered++;
  }catch(e){this.db.prepare("UPDATE certification_delivery_outbox SET status='BLOCKED',details=? WHERE delivery_key=? AND status='PENDING'").run(JSON.stringify({reason:e.message}),r.delivery_key);blocked++;}}
  return {delivered,blocked,deliveries:this.workflow.deliveries()};
 }
}
module.exports={CertifiedDelivery};