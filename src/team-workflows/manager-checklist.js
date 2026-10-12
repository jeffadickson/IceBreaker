'use strict';
// Versioned administrative workflow projection. Independent of league/sport engine.
// The saved record is an append-only series of evidence attestations. Never
// pretend an external portal was updated; only a manager can attest to that.
const crypto=require('node:crypto');
function validatePolicy(p){
  if(!p||typeof p.id!=='string'||!p.version||!p.gameTypes||typeof p.gameTypes!=='object')throw Error('invalid policy');
  const ids=new Set();
  for(const [type,tasks] of Object.entries(p.gameTypes)){
    if(!Array.isArray(tasks)||!tasks.length)throw Error(`empty workflow ${type}`);
    for(const t of tasks){
      if(!t.id||!t.label||!['before','during','after'].includes(t.phase)||ids.has(t.id))throw Error('invalid/duplicate task');
      ids.add(t.id);
    }
  }
  return p;
}
function openChecklist(policy,gameType,gameId){
  validatePolicy(policy);
  if(!policy.gameTypes[gameType]||!gameId)throw Error('invalid game type/id');
  return {id:crypto.randomUUID(),gameId,gameType,policyId:policy.id,policyVersion:policy.version,events:[]};
}
function recordEvidence(checklist,policy,{taskId,actorId,reference,action='complete',at=new Date().toISOString()}){
  validatePolicy(policy);
  if(checklist.policyId!==policy.id||checklist.policyVersion!==policy.version)throw Error('policy version mismatch');
  const task=policy.gameTypes[checklist.gameType]?.find(t=>t.id===taskId);
  if(!task)throw Error('unknown task');
  if(!actorId||typeof actorId!=='string')throw Error('authenticated actor required');
  if(!['complete','reopen'].includes(action))throw Error('invalid action');
  if(action==='complete'&&(!reference||typeof reference!=='string'))throw Error('evidence required');
  return {...checklist,events:[...checklist.events,{eventId:crypto.randomUUID(),taskId,actorId,action,reference:reference||null,at}]};
}
function project(checklist,policy){
  const status=new Map();
  for(const event of checklist.events)status.set(event.taskId,event.action==='complete');
  const tasks=policy.gameTypes[checklist.gameType].map(t=>({...t,done:status.get(t.id)===true}));
  return {gameId:checklist.gameId,policyId:checklist.policyId,policyVersion:checklist.policyVersion,tasks,completed:tasks.filter(t=>t.done).length,total:tasks.length};
}
module.exports={validatePolicy,openChecklist,recordEvidence,project};