'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LeagueStore}=require('../../server/league-store');
const {PlayerRegistry}=require('../../server/player-registry');
const {TeamAccounts}=require('../../server/team-accounts');
const {gameDate}=require('../../server/player-suspensions');
const {pregameSnapshot}=require('../../server/pregame-gate');
function setup(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'icebreaker-identity-')),file=path.join(dir,'league.db');
 const league=new LeagueStore(file,{seedDemo:true}),players=new PlayerRegistry(file),teams=new TeamAccounts(file);
 return {league,players,teams,close(){teams.close();players.close();league.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('permanent player identity retains private DOB/address and guardian relationships across seasons',t=>{
 const x=setup();t.after(()=>x.close());
 const {playerId}=x.players.createPlayer({displayName:'Player X',legalName:'Fictional Minor X',birthDate:'2016-04-15',address:{street:'123 Demo Street',city:'Fictionville'}},'registrar');
 const guardian=x.players.linkPerson(playerId,{fullName:'Fictional Guardian',email:'guardian@example.invalid',relationship:'GUARDIAN'},'registrar');
 x.players.linkRegistration(playerId,{issuer:'Demo Federation',identifier:'DEMO-2026-REG-999',seasonId:'demo-2026'},'registrar');
 assert.throws(()=>x.players.linkRegistration('m17',{issuer:'Demo Federation',identifier:'DEMO-2026-REG-999',seasonId:'demo-2026'},'registrar'),/UNIQUE/);
 assert.equal(x.players.privateProfile(playerId).birthDate,'2016-04-15');
 assert.equal(x.players.ageAt(playerId,'2026-01-01'),9);
 assert.equal(x.players.ageAt(playerId,'2026-04-15'),10);
 assert.equal(x.players.relatedPeople(playerId)[0].personId,guardian.personId);
 x.players.enroll(playerId,'maple',{jersey:55,position:'F'},'registrar');
 x.league.db.prepare('INSERT INTO seasons VALUES(?,?,?,?)').run('demo-2027','Demo 2027','2027-09-01','2027-12-31');
 x.league.db.prepare('INSERT INTO league_seasons VALUES(?,?)').run('demo-league','demo-2027');
 x.league.db.prepare('INSERT INTO divisions VALUES(?,?,?,?)').run('demo-12u','demo-2027','12U','v1');
 x.league.db.prepare('INSERT INTO teams VALUES(?,?,?,?,?,?)').run('new-team','demo-12u','Future Team','Future','Demo','blue');
 x.players.enroll(playerId,'new-team',{jersey:88,position:'G'},'registrar');
 const history=x.players.history(playerId);
 assert.equal(history.length,2);
 assert.deepEqual(history.map(h=>h.seasonId),['demo-2026','demo-2027']);
 assert.deepEqual(history.map(h=>h.teamId),['maple','new-team']);
 assert.equal(x.players.privateProfile(playerId).legalName,'Fictional Minor X');
 assert.equal(x.players.relatedPeople(playerId)[0].fullName,'Fictional Guardian');
 x.players.updatePrivateProfile(playerId,{legalName:'Fictional Minor X',birthDate:'2016-04-15',address:{city:'New Fictionville'}},'registrar');
 assert.equal(x.players.privateProfile(playerId).address.city,'New Fictionville');
 const publicSnapshot=JSON.stringify(x.league.snapshot());
 for(const secret of ['DEMO-2026-REG-999','2016-04-15','123 Demo Street','Fictional Guardian','guardian@example.invalid','Fictional Minor X'])assert.equal(publicSnapshot.includes(secret),false);
});
test('same-season transfer closes old membership without rewriting historical identity',t=>{
 const x=setup();t.after(()=>x.close());
 const {playerId}=x.players.createPlayer({displayName:'Test Player',legalName:'Test Legal Name',birthDate:'2015-02-01'},'registrar');
 x.players.enroll(playerId,'maple',{jersey:41,position:'F'},'registrar');
 const moved=x.players.enroll(playerId,'flyers',{jersey:42,position:'D',reason:'TRANSFER'},'registrar');
 assert.deepEqual(moved.previousTeams,['maple']);
 assert.equal(x.teams.roster('maple').some(p=>p.id===playerId),false);
 assert.equal(x.teams.roster('flyers').some(p=>p.id===playerId),true);
 const h=x.players.history(playerId);assert.equal(h.length,2);
 assert.ok(h[0].leftAt);assert.equal(h[1].leftAt,null);
 assert.throws(()=>x.players.enroll(playerId,'flyers',{jersey:42,position:'D'},'registrar'),/Already/);
});
test('annual training blocks only required seasons and preserves prior-year evidence',t=>{
 const x=setup();t.after(()=>x.close());
 const game=x.league.db.prepare("SELECT * FROM games WHERE status='scheduled' AND (home_team_id='maple' OR away_team_id='maple') LIMIT 1").get();
 const player=x.teams.roster('maple')[0],day=gameDate(x.league.db,game.id);
 const req=x.players.requireTraining({leagueId:'demo-league',seasonId:'demo-2026',code:'SAFETY-2026',title:'Annual safety module',blocksLineup:true},'league-admin');
 assert.deepEqual(x.players.trainingStatus(player.id,'maple',day).map(v=>v.complete),[false]);
 assert.throws(()=>x.teams.confirmLineup('maple',game.id,'manager',{playerIds:[player.id],expectedRosterRevision:0}),/training incomplete/);
 x.players.recordTraining({playerId:player.id,requirementId:req.requirementId,completedOn:'2026-09-20',expiresOn:'2026-12-31',evidenceRef:'record-001'},'registrar');
 assert.equal(x.players.trainingStatus(player.id,'maple',day)[0].complete,true);
 x.teams.confirmLineup('maple',game.id,'manager',{playerIds:[player.id],expectedRosterRevision:0});
 const otherTeam=game.home_team_id==='maple'?game.away_team_id:game.home_team_id;
 const away=x.teams.roster(otherTeam)[0];
 x.players.recordTraining({playerId:away.id,requirementId:req.requirementId,completedOn:'2026-09-20'},'registrar');
 x.teams.confirmLineup(otherTeam,game.id,'manager',{playerIds:[away.id],expectedRosterRevision:0});
 assert.equal(pregameSnapshot(x.teams.db,game.id).ready,true);
 const completion=x.players.db.prepare('SELECT id FROM player_training_completions WHERE player_id=?').get(player.id);
 // A revocation after lineup confirmation must invalidate pregame readiness.
 x.players.revokeTraining(completion.id,'Verification rescinded','league-admin');
 assert.equal(pregameSnapshot(x.teams.db,game.id).ready,false);
 assert.equal(x.teams.getLineup('maple',game.id).players.find(p=>p.id===player.id).eligible,false);
});
test('registrar can enroll before team account tables exist',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'icebreaker-registrar-')),file=path.join(dir,'league.db');
 const league=new LeagueStore(file,{seedDemo:true}),players=new PlayerRegistry(file);
 t.after(()=>{players.close();league.close();fs.rmSync(dir,{recursive:true,force:true});});
 const {playerId}=players.createPlayer({displayName:'New',legalName:'New Private',birthDate:'2016-05-02'},'registrar');
 assert.equal(players.enroll(playerId,'maple',{jersey:63,position:'F'},'registrar').playerId,playerId);
 assert.equal(players.history(playerId).length,1);
});
test('invalid private profiles and unverified training cannot be silently accepted',t=>{
 const x=setup();t.after(()=>x.close());
 assert.throws(()=>x.players.createPlayer({displayName:'A',legalName:'B',birthDate:'2026-02-30'},'registrar'),/Invalid/);
 const req=x.players.requireTraining({leagueId:'demo-league',seasonId:'demo-2026',code:'A',title:'Training'},'admin');
 assert.throws(()=>x.players.recordTraining({playerId:'missing',requirementId:req.requirementId,completedOn:'2026-10-01'},'registrar'),/Invalid/);
 assert.throws(()=>x.players.recordTraining({playerId:'m17',requirementId:req.requirementId,completedOn:'2026-10-01',expiresOn:'2026-09-30'},'registrar'),/Invalid/);
});
