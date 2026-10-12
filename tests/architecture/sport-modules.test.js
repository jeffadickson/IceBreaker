'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const sports=require('../../src/sports');
const goal={seq:1,id:'g1',type:'GOAL_RECORDED',team:'home',period:1,seconds:400};
test('registered sport contracts advertise capabilities',()=>{assert.deepEqual(sports.list().map(x=>x.id),['hockey','soccer']);assert.ok(sports.get('hockey').describe().capabilities.includes('power-play'));assert.ok(!sports.get('soccer').describe().capabilities.includes('power-play'));});
test('shared replay preserves hockey goal-as-shot invariant',()=>{const p=sports.replay({sportId:'hockey',events:[goal,{seq:2,id:'s1',type:'SHOT_RECORDED',team:'away',period:1,seconds:350}]});assert.deepEqual(p.scores,{home:1,away:0});assert.deepEqual(p.shots,{home:1,away:1});assert.equal(p.revision,2);});
test('soccer module reuses contract without importing hockey rules',()=>{const p=sports.replay({sportId:'soccer',events:[goal,{seq:2,id:'c1',type:'CARD_ISSUED',team:'away',period:1,seconds:420}]});assert.equal(p.cards.away,1);assert.equal(p.scores.home,1);});
test('sport mismatch and event sequence gaps fail closed',()=>{assert.throws(()=>sports.replay({sportId:'soccer',events:[{...goal,sportId:'hockey'}]}),/Sport mismatch/);assert.throws(()=>sports.replay({sportId:'hockey',events:[{...goal,seq:2}]}),/Noncontiguous/);});
test('unsupported sport-specific event is rejected',()=>assert.throws(()=>sports.replay({sportId:'hockey',events:[{seq:1,id:'c',type:'CARD_ISSUED',team:'away'}]}),/Unsupported hockey event/));