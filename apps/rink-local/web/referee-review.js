'use strict';
(()=>{
 const $=id=>document.getElementById(id);let token=null,current=null,submitting=false;
 const text=(node,value)=>{node.textContent=String(value??'');};
 async function call(route,options={}){const r=await fetch('/api/scoresheet/v1/'+route,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(options.headers||{})},cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||('HTTP '+r.status));return data;}
 function updateActions(){
  const ready=!!current&&current.status==='SUBMITTED'&&!submitting;
  $('approve').disabled=!ready||!$('intent').checked;
  $('reject').disabled=!ready;
  $('signStatus').textContent=!current?'Not available':current.status==='SUBMITTED'?($('intent').checked?'Ready for approval':'Awaiting review'):(current.status==='CERTIFIED'?'Certified':'No longer open');
 }
 $('intent').addEventListener('change',updateActions);
 function populateTable(id,items,fn){const body=$(id);body.replaceChildren();for(const item of items){const tr=document.createElement('tr');for(const field of fn(item)){const td=document.createElement('td');text(td,field);tr.append(td);}body.append(tr);}}
 async function load(){current=await call('review');$('intent').checked=false;const d=current.document;text($('signRevision'),'Revision '+current.revision);text($('homeScore'),d.score.home);text($('awayScore'),d.score.away);text($('status'),'Revision '+current.revision+' · '+current.status+' · Home shots '+d.shots.home+' · Away shots '+d.shots.away);text($('digest'),'SHA-256: '+current.digest);populateTable('goals',d.goals,g=>[g.period,g.team,g.details.scorer,`${g.details.assist1} / ${g.details.assist2}`]);populateTable('penalties',d.penalties,p=>[p.period,p.team,p.details.player,p.details.infraction+' ('+p.details.classification+')']);populateTable('shots',d.byPeriod||[],s=>[s.period,s.shots.home,s.shots.away]);$('login').classList.add('hidden');$('review').classList.remove('hidden');updateActions();}
 $('loginBtn').onclick=async()=>{try{const d=await call('referee/login',{method:'POST',body:JSON.stringify({refereeId:$('refId').value,password:$('password').value})});token=d.token;$('password').value='';await load();}catch(e){text($('loginError'),e.message);}};
 async function decide(decision){if(submitting)return;submitting=true;updateActions();try{if(!current)throw Error('No submitted scoresheet');if(decision==='APPROVE'&&!$('intent').checked)throw Error('Review the scoresheet and confirm signing intent first');
  if(decision==='REQUEST_CORRECTION'&&!$('reason').value.trim())throw Error('Explain what needs correction');
  // A stale review is never silently approved after a new journal revision.
  const latest=await call('review');
  if(latest.revision!==current.revision||latest.digest!==current.digest||latest.status!=='SUBMITTED')
   throw Error('Scoresheet changed. Refresh the page and review the new revision before signing');
  const attestation=$('intent').checked?'I have reviewed this exact scoresheet and intend to sign it':'';
  const d=await call('sign',{method:'POST',body:JSON.stringify({revision:current.revision,digest:current.digest,decision,reason:$('reason').value,attestation})});text($('decisionMessage'),d.status+' · '+d.at);current.status=d.status==='CERTIFIED'?'CERTIFIED':'SUPERSEDED';}catch(e){text($('decisionMessage'),e.message);}finally{submitting=false;updateActions();}}
 $('approve').onclick=()=>decide('APPROVE');$('reject').onclick=()=>decide('REQUEST_CORRECTION');$('print').onclick=()=>window.print();
})();