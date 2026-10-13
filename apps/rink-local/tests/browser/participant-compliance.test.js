'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {LeagueStore}=require('../../server/league-store');
const {PlayerRegistry}=require('../../server/player-registry');
const {TeamAccounts}=require('../../server/team-accounts');
const {pregameSnapshot}=require('../../server/pregame-gate');
const C=require('../../server/participant-compliance');
const {gameDate}=require('../../server/player-suspensions');
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-participant-')),file=path.join(dir,'league.db');
 const league=new LeagueStore(file,{seedDemo:true}),registry=new PlayerRegistry(file),team=new TeamAccounts(file);
 t.after(()=>{team.close();registry.close();league.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {db:league.db,league,registry,team};
}
test('external USA Hockey and league numbers are encrypted aliases, not player UID',t=>{
 const oldF=process.env.ICEBREAKER_PRIVATE_FIELD_KEY_BASE64,oldI=process.env.ICEBREAKER_IDENTIFIER_INDEX_KEY_BASE64;
 process.env.ICEBREAKER_PRIVATE_FIELD_KEY_BASE64=crypto.randomBytes(32).toString('base64');
 process.env.ICEBREAKER_IDENTIFIER_INDEX_KEY_BASE64=crypto.randomBytes(32).toString('base64');
 t.after(()=>{for(const [k,v] of [['ICEBREAKER_PRIVATE_FIELD_KEY_BASE64',oldF],['ICEBREAKER_IDENTIFIER_INDEX_KEY_BASE64',oldI]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const x=setup(t),player=x.registry.createPlayer({displayName:'Alias',legalName:'Private',birthDate:'2016-02-02'},'registrar').playerId;
 const a=C.linkExternalId(x.db,{subjectType:'PLAYER',subjectId:player,issuer:'USA_HOCKEY',identifier:'FAKE-USAH-0001',seasonId:'demo-2026'},'registrar');
 C.linkExternalId(x.db,{subjectType:'PLAYER',subjectId:player,issuer:'LOCAL_LEAGUE',identifier:'FAKE-LEAGUE-123',seasonId:'demo-2026'},'registrar');
 assert.notEqual(player,a.id);
 assert.equal(C.lookupExternalId(x.db,{issuer:'USA_HOCKEY',identifier:'FAKE-USAH-0001',seasonId:'demo-2026'}).subjectId,player);
 assert.equal(C.externalIds(x.db,'PLAYER',player).length,2);
 const raw=x.db.prepare('SELECT identifier_ciphertext,lookup_hmac FROM participant_external_ids WHERE id=?').get(a.id);
 assert.equal(raw.identifier_ciphertext.includes('FAKE-USAH-0001'),false);
 assert.equal(raw.lookup_hmac.includes('FAKE-USAH-0001'),false);
 assert.throws(()=>C.linkExternalId(x.db,{subjectType:'PLAYER',subjectId:player,issuer:'USA_HOCKEY',identifier:'FAKE-USAH-0001',seasonId:'demo-2026'},'registrar'),/UNIQUE/);
});
test('SafeSport for coach/manager and anti-bullying for player are independent scoped requirements',t=>{
 const x=setup(t),player=x.registry.createPlayer({displayName:'Youth',legalName:'Youth Private',birthDate:'2016-02-02'},'registrar').playerId;
 const adult=x.registry.linkPerson(player,{fullName:'Coach Example',relationship:'PARENT'},'registrar').personId;
 C.assignRole(x.db,{subjectType:'ADULT',subjectId:adult,role:'COACH',scopeType:'LEAGUE',scopeId:'demo-league',seasonId:'demo-2026'},'admin');
 C.assignRole(x.db,{subjectType:'ADULT',subjectId:adult,role:'PARENT',scopeType:'LEAGUE',scopeId:'demo-league',seasonId:'demo-2026'},'admin');
 C.requireCourse(x.db,{scopeType:'LEAGUE',scopeId:'demo-league',seasonId:'demo-2026',role:'COACH',code:'SAFESPORT',title:'SafeSport'},'admin');
 C.requireCourse(x.db,{scopeType:'LEAGUE',scopeId:'demo-league',seasonId:'demo-2026',role:'PLAYER',code:'ANTI_BULLYING',title:'Anti-bullying'},'admin');
 const args={scopeType:'LEAGUE',scopeId:'demo-league',seasonId:'demo-2026',date:'2026-10-13'};
 assert.equal(C.trainingForRole(x.db,{...args,subjectType:'ADULT',subjectId:adult,role:'COACH'})[0].eligible,false);
 assert.deepEqual(C.trainingForRole(x.db,{...args,subjectType:'ADULT',subjectId:adult,role:'PARENT'}),[]);
 assert.equal(C.trainingForRole(x.db,{...args,subjectType:'PLAYER',subjectId:player,role:'PLAYER'})[0].eligible,false);
 C.recordCourse(x.db,{subjectType:'ADULT',subjectId:adult,code:'SAFESPORT',completedOn:'2026-09-01',expiresOn:'2026-12-31'},'admin');
 assert.equal(C.trainingForRole(x.db,{...args,subjectType:'ADULT',subjectId:adult,role:'COACH'})[0].eligible,true);
 assert.equal(C.trainingForRole(x.db,{...args,subjectType:'PLAYER',subjectId:player,role:'PLAYER'})[0].eligible,false);
});
test('tournament policy explicitly waives league training but never suspension',t=>{
 const x=setup(t);
 const game=x.db.prepare("SELECT id,home_team_id home,away_team_id away,date FROM games WHERE status='scheduled' LIMIT 1").get();
 assert.ok(game);
 const player=x.team.roster(game.home)[0],other=x.team.roster(game.away)[0],day=gameDate(x.db,game.id);
 const req=x.registry.requireTraining({leagueId:'demo-league',seasonId:'demo-2026',code:'LEAGUE_TRAINING',title:'League training'},'admin');
 assert.ok(req.requirementId);
 assert.equal(C.gamePlayerTraining(x.db,player.id,game.home,game.id,day).some(r=>r.blocksLineup&&!r.complete),true);
 assert.throws(()=>x.team.confirmLineup(game.home,game.id,'manager',{playerIds:[player.id],expectedRosterRevision:0}),/training incomplete/);
 C.setCompetition(x.db,{gameId:game.id,type:'TOURNAMENT',note:'Independent tournament policy'},'league-admin');
 assert.equal(C.gamePlayerTraining(x.db,player.id,game.home,game.id,day).length,0);
 x.team.confirmLineup(game.home,game.id,'manager',{playerIds:[player.id],expectedRosterRevision:0});
 x.team.confirmLineup(game.away,game.id,'manager',{playerIds:[other.id],expectedRosterRevision:0});
 assert.equal(pregameSnapshot(x.team.db,game.id).ready,true);
 C.requireCourse(x.db,{scopeType:'TOURNAMENT',scopeId:game.id,role:'PLAYER',code:'TOURNEY_BRIEFING',title:'Tournament briefing'},'admin');
 assert.equal(pregameSnapshot(x.team.db,game.id).ready,false);
 C.recordCourse(x.db,{subjectType:'PLAYER',subjectId:player.id,code:'TOURNEY_BRIEFING',completedOn:day},'admin');
 C.recordCourse(x.db,{subjectType:'PLAYER',subjectId:other.id,code:'TOURNEY_BRIEFING',completedOn:day},'admin');
 assert.equal(pregameSnapshot(x.team.db,game.id).ready,true);
 x.db.prepare('INSERT INTO player_suspensions(id,player_id,league_id,start_date,end_date,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),player.id,'demo-league',day,day,'Test suspension','league-admin',new Date().toISOString());
 assert.equal(pregameSnapshot(x.team.db,game.id).ready,false);
 // A tournament policy never overrides a league suspension.
});
