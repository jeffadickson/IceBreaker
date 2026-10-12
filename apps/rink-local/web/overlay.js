'use strict';
/* Broadcast-only consumer. Never embeds an operator credential or issues a scoring command. */
(function(){
 const q=new URLSearchParams(location.search),mode=q.get('mode')==='arena'?'arena':'full';
 const compact=q.get('layout')==='compact';if(compact)document.body.classList.add('compact');
 const endpoint=mode==='arena'?'/api/games/demo/arena-scoreboard':'/api/games/demo/snapshot';
 const el=id=>document.getElementById(id);
 let last=null,lastSeen=0,tickAnchor=0,source=null;
 const safeSeconds=n=>Number.isFinite(n)?Math.max(0,Math.min(3600,Math.floor(n))):0;
 const clockText=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
 function current(){if(!last)return 900;return Math.max(0,safeSeconds(last.seconds)-(last.running?Math.floor((performance.now()-tickAnchor)/1000):0));}
 function render(){if(!last)return;el('home-name').textContent=last.teams?.home||'HOME';el('away-name').textContent=last.teams?.away||'AWAY';
  el('home-score').textContent=Number.isInteger(last.scores?.home)?last.scores.home:0;el('away-score').textContent=Number.isInteger(last.scores?.away)?last.scores.away:0;
  el('home-shots').textContent=`SHOTS ${Number.isInteger(last.shots?.home)?last.shots.home:0}`;el('away-shots').textContent=`SHOTS ${Number.isInteger(last.shots?.away)?last.shots.away:0}`;
  el('game-clock').textContent=clockText(current());el('game-period').textContent=last.ended?'FINAL':`PERIOD ${last.period||1}`;
  const penalties=last.penalties||{};let out='';if(Array.isArray(penalties.active)){out=penalties.active.slice(0,3).map(p=>`${p.team==='home'?'HOME':'AWAY'} #${p.player||'TBD'} ${clockText(safeSeconds(p.remaining))}`).join(' • ');}else if(penalties.teamStrength)out=`${penalties.teamStrength.home} ON ${penalties.teamStrength.away}`;
  el('penalties').textContent=out;
  const stale=(Date.now()-lastSeen)>15000;el('offline').classList.toggle('hidden',!stale);el('game-status').textContent=stale?'CONNECTION LOST':last.ended?'FINAL':last.running?'CLOCK RUNNING':'CLOCK STOPPED';el('game-status').classList.toggle('lost',stale);
 }
 function update(data){if(!data||typeof data!=='object'||!data.scores)return;last=data;lastSeen=Date.now();tickAnchor=performance.now();render();}
 async function poll(){try{const r=await fetch(endpoint,{cache:'no-store'});if(!r.ok)throw Error(String(r.status));update(await r.json());}catch{render();}}
 // Full-score uses SSE for immediate updates; arena mode polls because public arena projection differs.
 if(mode==='full'&&typeof EventSource!=='undefined'){source=new EventSource('/api/games/demo/events');source.addEventListener('snapshot',e=>{try{update(JSON.parse(e.data));}catch{}});}
 poll();setInterval(render,200);setInterval(poll,mode==='arena'?2000:10000);
 window.addEventListener('beforeunload',()=>source?.close());
})();