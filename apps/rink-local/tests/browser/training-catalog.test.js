'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LeagueStore}=require('../../server/league-store');
const {PlayerRegistry}=require('../../server/player-registry');
const {TeamAccounts}=require('../../server/team-accounts');
const {gameDate}=require('../../server/player-suspensions');
const {pregameSnapshot}=require('../../server/pregame-gate');
const training=require('../../server/training-catalog');
const compliance=require('../../server/participant-compliance');
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ib-training-')),file=path.join(dir,'league.db');
 const league=new LeagueStore(file,{seedDemo:true}),registry=new PlayerRegistry(file),team=new TeamAccounts(file);
 t.after(()=>{team.close();registry.close();league.close();fs.rmSync(dir,{recursive:true,force:true});});
 const player=registry.createPlayer({displayName:'Fictional',legalName:'Private Fictional',birthDate:'2016-01-01'},'registrar').playerId;
 const adult=registry.linkPerson(player,{fullName:'Fictional Coach',relationship:'PARENT'},'registrar').personId;
 return {db:league.db,registry,team,player,adult};
}
test('training catalog is data-driven and season policies do not rewrite historical records',t=>{
 const x=setup(t);
 const course=training.createTraining(x.db,{code:'SAFESPORT',title:'SafeSport',issuer:'USA Hockey'},'league-admin');
 assert.equal(training.catalog(x.db).find(c=>c.code==='SAFESPORT').trainingId,course.trainingId);
 const policy=training.addPolicy(x.db,{trainingId:course.trainingId,scopeType:'LEAGUE',scopeId:'demo-league',seasonId:'demo-2026',role:'COACH',renewalMode:'ANNUAL_SEASON',effectiveFrom:'2026-09-01'},'league-admin');
 assert.equal(policy.revision,1);
 const args={subjectType:'ADULT',subjectId:x.adult,role:'COACH',scopeType:'LEAGUE',scopeId:'demo-league',seasonId:'demo-2026',date:'2026-10-13'};
 assert.equal(training.status(x.db,args)[0].eligible,false);
 const first=training.recordCompletion(x.db,{trainingId:course.trainingId,subjectType:'ADULT',subjectId:x.adult,completedOn:'2026-09-10'},'league-admin');
 assert.equal(training.status(x.db,args)[0].eligible,true);
 x.db.prepare('INSERT INTO seasons VALUES(?,?,?,?)').run('demo-2027','Demo 2027','2027-09-01','2027-12-31');
 x.db.prepare('INSERT INTO league_seasons VALUES(?,?)').run('demo-league','demo-2027');
 training.addPolicy(x.db,{trainingId:course.trainingId,scopeType:'LEAGUE',scopeId:'demo-league',seasonId:'demo-2027',role:'COACH',renewalMode:'ANNUAL_SEASON',effectiveFrom:'2027-09-01'},'league-admin');
 assert.equal(training.status(x.db,{...args,seasonId:'demo-2027',date:'2027-10-13'})[0].eligible,false);
 assert.equal(training.status(x.db,args)[0].eligible,true);
 const second=training.recordCompletion(x.db,{trainingId:course.trainingId,subjectType:'ADULT',subjectId:x.adult,completedOn:'2027-09-10'},'league-admin');
 assert.equal(training.status(x.db,{...args,seasonId:'demo-2027',date:'2027-10-13'})[0].eligible,true);
 training.revokeCompletion(x.db,second.completionId,'Record rescinded','league-admin');
 assert.equal(training.status(x.db,{...args,seasonId:'demo-2027',date:'2027-10-13'})[0].eligible,false);
 assert.equal(training.status(x.db,args)[0].eligible,true);
 assert.ok(first.completionId);
});
test('calendar-year and rolling renewal periods are evaluated on game date',t=>{
 const x=setup(t);
 const annual=training.createTraining(x.db,{code:'ANTI_BULLYING',title:'Anti-bullying'},'admin');
 const rolling=training.createTraining(x.db,{code:'CPR',title:'CPR refresher'},'admin');
 for(const [course,mode,days] of [[annual,'ANNUAL_CALENDAR',null],[rolling,'ROLLING_DAYS',365]]){
  training.addPolicy(x.db,{trainingId:course.trainingId,scopeType:'LEAGUE',scopeId:'demo-league',role:'PLAYER',renewalMode:mode,validityDays:days,effectiveFrom:'2026-01-01'},'admin');
  training.recordCompletion(x.db,{trainingId:course.trainingId,subjectType:'PLAYER',subjectId:x.player,completedOn:'2026-01-01'},'admin');
 }
 const status=date=>training.status(x.db,{subjectType:'PLAYER',subjectId:x.player,role:'PLAYER',scopeType:'LEAGUE',scopeId:'demo-league',date});
 assert.equal(status('2026-12-31').every(r=>r.eligible),true);
 assert.equal(status('2027-01-01').find(r=>r.code==='ANTI_BULLYING').eligible,false);
 assert.equal(status('2027-01-01').find(r=>r.code==='CPR').eligible,true);
 assert.equal(status('2027-01-02').find(r=>r.code==='CPR').eligible,false);
});
test("policy revisions are append-only and can change next year\'s training without schema changes",t=>{
 const x=setup(t),c=training.createTraining(x.db,{code:'CLUB_ORIENTATION',title:'Club orientation'},'admin');
 const base={trainingId:c.trainingId,scopeType:'LEAGUE',scopeId:'demo-league',role:'MANAGER',renewalMode:'ONCE'};
 const a=training.addPolicy(x.db,{...base,effectiveFrom:'2026-01-01',required:true},'admin');
 const b=training.addPolicy(x.db,{...base,effectiveFrom:'2027-01-01',required:false},'admin');
 assert.deepEqual([a.revision,b.revision],[1,2]);
 assert.equal(training.status(x.db,{subjectType:'ADULT',subjectId:x.adult,role:'MANAGER',scopeType:'LEAGUE',scopeId:'demo-league',date:'2026-10-01'})[0].eligible,false);
 assert.equal(training.status(x.db,{subjectType:'ADULT',subjectId:x.adult,role:'MANAGER',scopeType:'LEAGUE',scopeId:'demo-league',date:'2027-10-01'})[0].eligible,true);
 assert.equal(x.db.prepare('SELECT COUNT(*) n FROM training_policy_versions').get().n,2);
 assert.throws(()=>training.addPolicy(x.db,{...base,renewalMode:'ROLLING_DAYS',effectiveFrom:'2028-01-01'},'admin'),/validityDays/);
});
test('catalog player training blocks league lineups but tournament exemption leaves legacy course history unchanged',t=>{
 const x=setup(t),game=x.db.prepare("SELECT id,home_team_id home,away_team_id away FROM games WHERE status='scheduled' LIMIT 1").get();
 const player=x.team.roster(game.home)[0],other=x.team.roster(game.away)[0],day=gameDate(x.db,game.id);
 const course=training.createTraining(x.db,{code:'ANTI_BULLYING',title:'Anti-bullying'},'admin');
 training.addPolicy(x.db,{trainingId:course.trainingId,scopeType:'LEAGUE',scopeId:'demo-league',seasonId:'demo-2026',role:'PLAYER',renewalMode:'ANNUAL_SEASON',effectiveFrom:'2026-09-01'},'admin');
 assert.equal(compliance.gamePlayerTraining(x.db,player.id,game.home,game.id,day)[0].code,'ANTI_BULLYING');
 assert.throws(()=>x.team.confirmLineup(game.home,game.id,'manager',{playerIds:[player.id],expectedRosterRevision:0}),/training incomplete/);
 compliance.setCompetition(x.db,{gameId:game.id,type:'TOURNAMENT',note:'No league courses required'},'admin');
 x.team.confirmLineup(game.home,game.id,'manager',{playerIds:[player.id],expectedRosterRevision:0});
 x.team.confirmLineup(game.away,game.id,'manager',{playerIds:[other.id],expectedRosterRevision:0});
 assert.equal(pregameSnapshot(x.team.db,game.id).ready,true);
 assert.equal(training.status(x.db,{subjectType:'PLAYER',subjectId:player.id,role:'PLAYER',scopeType:'LEAGUE',scopeId:'demo-league',seasonId:'demo-2026',date:day})[0].eligible,false);
});
