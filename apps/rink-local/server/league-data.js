'use strict';
// DEMONSTRATION FIXTURES ONLY. Not published, certified, or sourced from real teams.
const teams=[
{id:'maple',name:'Pasadena Maple Leafs',short:'Maple Leafs',city:'Pasadena',tone:'blue'},
{id:'flyers',name:'Santa Clarita Flyers',short:'Flyers',city:'Santa Clarita',tone:'orange'},
{id:'kings',name:'LA Junior Kings',short:'Junior Kings',city:'El Segundo',tone:'purple'},
{id:'bears',name:'Valencia Ice Bears',short:'Ice Bears',city:'Valencia',tone:'teal'}
];
const players=[
{id:'m17',teamId:'maple',number:17,name:'Player 17',position:'F'},
{id:'m8',teamId:'maple',number:8,name:'Player 8',position:'F'},
{id:'m21',teamId:'maple',number:21,name:'Player 21',position:'D'},
{id:'m29',teamId:'maple',number:29,name:'Player 29',position:'G'},
{id:'f22',teamId:'flyers',number:22,name:'Player 22',position:'F'},
{id:'f9',teamId:'flyers',number:9,name:'Player 9',position:'F'},
{id:'f31',teamId:'flyers',number:31,name:'Player 31',position:'G'},
{id:'k10',teamId:'kings',number:10,name:'Player 10',position:'F'},
{id:'k15',teamId:'kings',number:15,name:'Player 15',position:'D'},
{id:'k30',teamId:'kings',number:30,name:'Player 30',position:'G'},
{id:'b7',teamId:'bears',number:7,name:'Player 7',position:'F'},
{id:'b11',teamId:'bears',number:11,name:'Player 11',position:'D'},
{id:'b35',teamId:'bears',number:35,name:'Player 35',position:'G'}
];
function game(id,date,home,away,homeScore,awayScore,goals=[],status='final'){
return {id,date,venue:'Pasadena Ice Arena',sheet:'Rink 2',home,away,homeScore,awayScore,status,goals,certification:status==='final'?'DEMO_CERTIFIED_FIXTURE':'UNVERIFIED'};
}
const fixtures=[
game('g01','2026-10-03T11:00:00-07:00','maple','flyers',4,2,[['m17','m8'],['m17','m21'],['m8','m17'],['m21','m8'],['f22','f9'],['f9','f22']]),
game('g02','2026-10-03T14:00:00-07:00','kings','bears',2,2,[['k10','k15'],['k15','k10'],['b7','b11'],['b11','b7']]),
game('g03','2026-10-05T18:30:00-07:00','maple','kings',3,1,[['m17','m8'],['m8','m21'],['m17',null],['k10','k15']]),
game('g04','2026-10-05T20:00:00-07:00','flyers','bears',2,3,[['f22','f9'],['f9',null],['b7','b11'],['b7',null],['b11','b7']]),
game('g05','2026-10-09T18:00:00-07:00','bears','maple',1,2,[['b7','b11'],['m17','m8'],['m8','m17']]),
game('g06','2026-10-10T13:00:00-07:00','flyers','kings',1,4,[['f22',null],['k10','k15'],['k10',null],['k15','k10'],['k10',null]]),
game('g07','2026-10-12T18:30:00-07:00','maple','flyers',null,null,[],'live'),
game('g08','2026-10-17T10:00:00-07:00','kings','maple',null,null,[],'scheduled'),
game('g09','2026-10-17T12:30:00-07:00','bears','flyers',null,null,[],'scheduled'),
game('g10','2026-10-24T11:00:00-07:00','flyers','maple',null,null,[],'scheduled')
];
function deriveStandings(games=fixtures){const rows=Object.fromEntries(teams.map(t=>[t.id,{teamId:t.id,played:0,wins:0,losses:0,ties:0,gf:0,ga:0,points:0}]));
for(const g of games){if(g.status!=='final')continue;if(!rows[g.home]||!rows[g.away]||!Number.isInteger(g.homeScore)||!Number.isInteger(g.awayScore))throw Error('Invalid certified result');const home=rows[g.home],away=rows[g.away];home.played++;away.played++;home.gf+=g.homeScore;home.ga+=g.awayScore;away.gf+=g.awayScore;away.ga+=g.homeScore;if(g.homeScore>g.awayScore){home.wins++;away.losses++;home.points+=2;}else if(g.homeScore<g.awayScore){away.wins++;home.losses++;away.points+=2;}else{home.ties++;away.ties++;home.points++;away.points++;}}
return Object.values(rows).map(r=>({...r,diff:r.gf-r.ga})).sort((a,b)=>b.points-a.points||b.wins-a.wins||b.diff-a.diff||a.teamId.localeCompare(b.teamId));}
function derivePlayers(games=fixtures){const result=Object.fromEntries(players.map(p=>[p.id,{...p,gp:0,g:0,a:0,pts:0}]));for(const g of games){if(g.status!=='final')continue;for(const p of players){if(p.teamId===g.home||p.teamId===g.away)result[p.id].gp++;}const tally={};for(const [scorer,assist] of g.goals){if(!result[scorer]||result[scorer].teamId!==g.home&&result[scorer].teamId!==g.away)throw Error('Invalid fixture scorer');tally[result[scorer].teamId]=(tally[result[scorer].teamId]||0)+1;result[scorer].g++;if(assist){if(!result[assist]||result[assist].teamId!==result[scorer].teamId||scorer===assist)throw Error('Invalid fixture assist');result[assist].a++;}}if((tally[g.home]||0)!==g.homeScore||(tally[g.away]||0)!==g.awayScore)throw Error('Goal fixture does not reconcile to score '+g.id);}return Object.values(result).map(p=>({...p,pts:p.g+p.a})).sort((a,b)=>b.pts-a.pts||b.g-a.g||a.id.localeCompare(b.id));}
function snapshot(authority){const live=authority?.spectator();const schedule=fixtures.map(g=>g.status==='live'&&live?{...g,homeScore:live.scores.home,awayScore:live.scores.away,period:live.period,seconds:live.seconds,updatedRevision:live.revision}:g);return {schemaVersion:1,source:'DEMONSTRATION_FIXTURES',message:'Fictional demonstration teams and players; not real league results.',standingsPolicy:{id:'DEMO-2-1-0-v1',win:2,tie:1,loss:0,tiebreakers:['points','wins','goal differential','team ID'],certifiedOnly:true},teams,players:derivePlayers(),standings:deriveStandings(),schedule,revision:live?.revision??0};}
module.exports={teams,players,fixtures,deriveStandings,derivePlayers,snapshot};
