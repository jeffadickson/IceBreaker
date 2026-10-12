(()=>{'use strict';
const $=id=>document.getElementById(id);const key='local-development-key';let snapshot=null,draft=null,confirmedRosters=null,phase='',assistIndex=1,selectAssist=false,previousPhase='',pending=false;
const jerseys={home:[7,8,9,11,12,14,17,19,21,22,24,29],away:[6,9,11,12,14,17,18,22,24,27,33,39]};
let penalties=['Tripping','Hooking','Slashing','Holding','Interference','Cross-checking','High-sticking','Roughing','Boarding','Charging','Elbowing','Delay of game'];
const fmt=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
async function audit(action,context=''){try{await fetch('/api/operator/action',{method:'POST',headers:{'Content-Type':'application/json','X-Operator-Key':key},body:JSON.stringify({action,context})});}catch{message('Audit connection failed',true);}}
function message(s,err=false){$('message').textContent=s;$('message').className=err?'error':'status';}
function render(){if(!snapshot)return;$('hs').textContent=snapshot.scores.home;$('as').textContent=snapshot.scores.away;$('sh').textContent=snapshot.shots?.home??0;$('sa').textContent=snapshot.shots?.away??0;$('period').textContent=`PERIOD ${snapshot.period}`;$('time').textContent=fmt(snapshot.seconds);$('running').textContent=snapshot.running?'RUNNING':'STOPPED';$('conn').textContent='● BACKEND CONNECTED';$('count').textContent=`(${snapshot.events.length})`;
 $('events').replaceChildren(...[...snapshot.events].reverse().slice(0,50).map(e=>{const row=document.createElement('div');row.className='event';const t=document.createElement('time');t.textContent=`P${e.period} ${fmt(e.seconds)}`;const content=document.createElement('div');const title=document.createElement('strong');title.textContent=e.type.replaceAll('_',' ')+(e.team?' · '+(e.team==='home'?'Maple Leafs':'Flyers'):'');const desc=document.createElement('p');desc.textContent=e.type==='GOAL_RECORDED'?`Scorer ${e.details.scorer}, assists ${e.details.assist1} / ${e.details.assist2}`:e.type==='PENALTY_ASSESSED'?`#${e.details.player} ${e.details.infraction} (${fmt(e.details.duration)})`:e.type==='GOAL_ATTRIBUTION_CORRECTED'?`Corrected scorer ${e.details.scorer}, assists ${e.details.assist1} / ${e.details.assist2}`:'';content.append(title,desc);row.append(t,content);return row;}));}
async function refreshReadiness(){
 try{
  const response=await fetch('/api/operator/status',{headers:{'X-Operator-Key':key}});
  if(!response.ok)throw Error('Operator status unavailable');
  const status=await response.json();
  const pending=status.outbox.pending;
  $('syncStatus').textContent=pending?`${pending} event${pending===1?'':'s'} queued · ${status.outbox.delivered} delivered`:`No queued events · ${status.outbox.delivered} delivered`;
  $('logStatus').textContent=status.mirrorHealthy?'Text mirror healthy':'⚠ Text mirror needs repair';
  if(!status.roster.bound){confirmedRosters=null;$('rosterStatus').textContent='Demo mode · No league fixture assigned';return;}
  if(!status.roster.confirmed){confirmedRosters=null;$('rosterStatus').textContent='⚠ Lineup confirmations required';return;}
  const r=await fetch('/api/operator/game-rosters',{headers:{'X-Operator-Key':key}});
  if(!r.ok)throw Error('Cannot load confirmed lineups');
  const d=await r.json();
  confirmedRosters={home:d.teams.home.players.map(x=>String(x.jersey)),away:d.teams.away.players.map(x=>String(x.jersey))};
  $('rosterStatus').textContent=`Confirmed · Maple Leafs ${confirmedRosters.home.length} · Flyers ${confirmedRosters.away.length}`;
  if(draft&&phase!=='confirm')paint();
 }catch(e){$('rosterStatus').textContent='⚠ '+e.message;confirmedRosters=null;$('syncStatus').textContent='Unavailable';}
}
function open(type,team){draft=type==='goal'?{type:'GOAL_RECORDED',team,scorer:'TBD',assist1:'TBD',assist2:'TBD'}:{type:'PENALTY_ASSESSED',team,player:'TBD',infraction:'Tripping',duration:120,classification:'MINOR'};draft._key=crypto.randomUUID();phase='player';assistIndex=1;selectAssist=false;$('welcome').classList.add('hidden');$('editor').classList.remove('hidden');$('editorTitle').textContent=(type==='goal'?'Record goal':'Record penalty')+' · '+(team==='home'?'Pasadena Maple Leafs':'Santa Clarita Flyers');audit('DRAFT_OPENED',type+':'+team);paint();}
function paint(){if(!draft)return;$('pick').classList.toggle('hidden',phase==='confirm');$('confirmPanel').classList.toggle('hidden',phase!=='confirm');$('draftActions').classList.toggle('hidden',phase==='confirm');$('penaltyPanel').classList.toggle('hidden',draft.type!=='PENALTY_ASSESSED'||phase!=='penalty');$('assistPanel').classList.toggle('hidden',!['GOAL_RECORDED','GOAL_ATTRIBUTION_CORRECTED'].includes(draft.type)||phase!=='assists');
 for(const [id,active] of [['stepPlayer',phase==='player'],['stepAssist',phase==='assists'||phase==='penalty'],['stepConfirm',phase==='confirm']])$(id).classList.toggle('current',active);
 $('playerLabel').textContent=phase==='assists'?'Choose assist '+assistIndex:'Jersey number';$('assistLabel').textContent='Assist '+assistIndex+' · '+draft['assist'+assistIndex];
 $('numbers').replaceChildren(...(confirmedRosters?.[draft.team]||jerseys[draft.team]).map(n=>{const b=document.createElement('button');b.textContent='#'+n;b.classList.toggle('active',String(n)===(phase==='assists'?draft['assist'+assistIndex]:draft.scorer||draft.player));b.onclick=()=>chooseNumber(String(n));return b;}));
 const tbd=document.createElement('button');tbd.textContent='TBD';tbd.className='active';tbd.onclick=()=>chooseNumber('TBD');$('numbers').append(tbd);
 $('numbers').classList.toggle('hidden',phase==='penalty');
 $('penalties').replaceChildren(...penalties.map(p=>{const b=document.createElement('button');b.textContent=p;b.classList.toggle('active',draft.infraction===p);b.onclick=()=>{draft.infraction=p;audit('DRAFT_PENALTY_SELECTED',p);paint();};return b;}));
 for(const b of $('durations').querySelectorAll('button'))b.classList.toggle('active',Number(b.dataset.duration)===draft.duration);
 $('next').textContent=phase==='player'?(draft.type==='PENALTY_ASSESSED'?'Next: penalty →':'Next: assists →'):'Review event →';
 if(phase==='confirm'){const parts=draft.type==='GOAL_RECORDED'?['GOAL · '+draft.team.toUpperCase(),'Scorer: '+draft.scorer,'Assist 1: '+draft.assist1,'Assist 2: '+draft.assist2]:draft.type==='PENALTY_ASSESSED'?['PENALTY · '+draft.team.toUpperCase(),'Player: '+draft.player,'Infraction: '+draft.infraction,'Classification: '+draft.classification,'Duration: '+fmt(draft.duration)]:['CORRECTION','Scorer: '+draft.scorer,'Assist 1: '+draft.assist1,'Assist 2: '+draft.assist2];$('summary').replaceChildren(...parts.map(x=>{const p=document.createElement('div');p.textContent=x;return p;}));}}
function chooseNumber(n){if(phase==='assists'){draft['assist'+assistIndex]=n;audit('DRAFT_ASSIST_SELECTED',assistIndex+':'+n);if(assistIndex===1){assistIndex=2;paint();}else{phase='confirm';paint();}}else{draft[draft.type==='PENALTY_ASSESSED'?'player':'scorer']=n;audit('DRAFT_PLAYER_SELECTED',n);phase=draft.type==='PENALTY_ASSESSED'?'penalty':'assists';paint();}}
function step(){if(phase==='player')phase=draft.type==='PENALTY_ASSESSED'?'penalty':'assists';else if(phase==='assists'||phase==='penalty')phase='confirm';audit('DRAFT_STEP',phase);paint();}
function discard(){audit('DRAFT_CANCELLED',draft?.type);draft=null;phase='';$('editor').classList.add('hidden');$('welcome').classList.remove('hidden');message('Draft discarded. Official score unchanged.');}
async function command(cmd){if(pending)return;pending=true;try{const r=await fetch('/api/operator/command',{method:'POST',headers:{'Content-Type':'application/json','X-Operator-Key':key,'Idempotency-Key':cmd._key||(cmd._key=crypto.randomUUID())},body:JSON.stringify(cmd)});const body=await r.json();if(!r.ok)throw Error(body.error);message(`Committed event ${body.revision}${body.mirrorHealthy===false?' · WARNING: text log failed':''}`);return true;}catch(e){message(e.message,true);return false;}finally{pending=false;}}
async function refresh(){try{const r=await fetch('/api/games/demo/snapshot');snapshot=await r.json();render();await refreshReadiness();}catch{$('conn').textContent='● DISCONNECTED';}}
for(const b of document.querySelectorAll('[data-open]'))b.onclick=()=>open(b.dataset.open,b.dataset.team);
for(const b of document.querySelectorAll('[data-attr]'))b.onclick=()=>{if(b.dataset.attr==='pick')return;draft['assist'+assistIndex]=b.dataset.attr;audit('DRAFT_ASSIST_SELECTED',assistIndex+':'+b.dataset.attr);if(assistIndex===1){assistIndex=2;paint();}else{phase='confirm';paint();}};
for(const b of document.querySelectorAll('[data-duration]'))b.onclick=()=>{draft.duration=Number(b.dataset.duration);audit('DRAFT_DURATION_SELECTED',String(draft.duration));paint();};
$('penaltyClass').onchange=e=>{if(draft?.type==='PENALTY_ASSESSED'){draft.classification=e.target.value;audit('DRAFT_PENALTY_CLASS_CHANGED',draft.classification);}};
$('next').onclick=step;$('discard').onclick=discard;$('cancel').onclick=discard;$('edit').onclick=()=>{audit('DRAFT_EDIT_FROM_CONFIRM',draft.type);phase=draft.type==='PENALTY_ASSESSED'?'penalty':'assists';assistIndex=1;paint();};
$('editPlayer').onclick=()=>{audit('DRAFT_EDIT_PLAYER',draft.type);phase='player';paint();};
$('confirm').onclick=async()=>{await audit('DRAFT_CONFIRM_REQUESTED',draft.type);if(await command(draft)){audit('DRAFT_CONFIRMED',draft.type);draft=null;$('editor').classList.add('hidden');$('welcome').classList.remove('hidden');await refresh();}};
$('start').onclick=()=>command({type:'CLOCK_UPDATED',action:'START',seconds:snapshot.seconds});$('stop').onclick=()=>command({type:'CLOCK_UPDATED',action:'STOP',seconds:snapshot.seconds});
$('endPeriod').onclick=async()=>{if(confirm('End the current period?'))await command({type:'PERIOD_ENDED'});};
$('advance').onclick=async()=>{if(confirm('Advance to next period?'))await command({type:'PERIOD_ADVANCED',seconds:900});};
$('shotHome').onclick=async()=>{if(confirm('Record a Pasadena Maple Leafs shot on goal?')){await audit('SHOT_CONFIRMED','home');await command({type:'SHOT_RECORDED',team:'home'});await refresh();}};
$('shotAway').onclick=async()=>{if(confirm('Record a Santa Clarita Flyers shot on goal?')){await audit('SHOT_CONFIRMED','away');await command({type:'SHOT_RECORDED',team:'away'});await refresh();}};
$('endGame').onclick=async()=>{if(confirm('End game and generate UNOFFICIAL report?')){await audit('END_GAME_REQUESTED');if(await command({type:'GAME_ENDED'})){await refresh();window.open('/api/games/demo/unofficial-report','_blank');}}};
fetch('/api/league/v1/penalty-frequency').then(r=>r.json()).then(d=>{const favorite=d.items.map(x=>x.infraction);penalties=[...new Set([...favorite,...penalties])].slice(0,20);}).catch(()=>{});
$('correct').onclick=()=>{const goal=[...snapshot.events].reverse().find(e=>e.type==='GOAL_RECORDED');if(!goal)return message('No goal to correct.',true);draft={type:'GOAL_ATTRIBUTION_CORRECTED',originalEventId:goal.id,scorer:goal.details.scorer,assist1:goal.details.assist1,assist2:goal.details.assist2,reason:'Scorekeeper correction',_key:crypto.randomUUID()};phase='player';$('welcome').classList.add('hidden');$('editor').classList.remove('hidden');$('editorTitle').textContent='Correct goal attribution';audit('DRAFT_CORRECTION_OPENED',goal.id);paint();};
$('reloadRoster').onclick=()=>refreshReadiness();refresh();setInterval(refreshReadiness,10000);const stream=new EventSource('/api/games/demo/events');stream.addEventListener('snapshot',e=>{const s=JSON.parse(e.data);if(!snapshot||s.revision>=snapshot.revision){snapshot=s;render();}});stream.onerror=()=>{$('conn').textContent='● RECONNECTING';};
})();