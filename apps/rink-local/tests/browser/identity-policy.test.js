'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {can,initialParentGrant}=require('../../server/identity-policy');
test('new parent can only access own account actions',()=>{
 const id='u1',principal={id,grants:[initialParentGrant(id)]};
 assert.equal(can(principal,'account:read',{scopeType:'USER',scopeId:id}),true);
 assert.equal(can(principal,'game:score',{scopeType:'GAME',scopeId:'g1'}),false);
 assert.equal(can(principal,'registration:read',{scopeType:'LEAGUE',scopeId:'l1'}),false);
});
test('game grants never cross game boundaries',()=>{
 const principal={id:'u2',grants:[{userId:'u2',role:'SCOREKEEPER',scopeType:'GAME',scopeId:'g1'}]};
 assert.equal(can(principal,'game:score',{scopeType:'GAME',scopeId:'g1'}),true);
 assert.equal(can(principal,'game:score',{scopeType:'GAME',scopeId:'g2'}),false);
 assert.equal(can(principal,'scoresheet:certify',{scopeType:'GAME',scopeId:'g1'}),false);
});
test('revoked, expired, disabled, and mismatched user grants fail closed',()=>{
 const grant={userId:'u2',role:'SCOREKEEPER',scopeType:'GAME',scopeId:'g1'};
 const resource={scopeType:'GAME',scopeId:'g1'};
 for(const p of [{id:'u2',disabled:true,grants:[grant]},{id:'u3',grants:[grant]},
   {id:'u2',grants:[{...grant,revokedAt:'2026-01-01'}]},
   {id:'u2',grants:[{...grant,expiresAt:'2020-01-01'}]}])
   assert.equal(can(p,'game:score',resource),false);
});
test('platform superuser needs a verified MFA context and cannot be impersonated by parent',()=>{
 const grant={userId:'root',role:'PLATFORM_SUPERUSER',scopeType:'PLATFORM',scopeId:'*'};
 assert.equal(can({id:'root',grants:[grant]},'platform:admin',{}),false);
 assert.equal(can({id:'root',mfaVerified:true,grants:[grant]},'platform:admin',{}),false);
 assert.equal(can({id:'root',mfaVerified:true,superuserBootstrapped:true,grants:[grant]},'platform:admin',{}),true);
 assert.equal(can({id:'root',mfaVerified:true,grants:[initialParentGrant('root')]},'platform:admin',{}),false);
});

test('parent cannot read another user account',()=>{
 const principal={id:'parent1',grants:[initialParentGrant('parent1')]};
 assert.equal(can(principal,'account:read',{scopeType:'USER',scopeId:'parent2'}),false);
});
test('malformed grant expiry fails closed',()=>{
 const principal={id:'u',grants:[{userId:'u',role:'SCOREKEEPER',scopeType:'GAME',scopeId:'g',expiresAt:'not-a-date'}]};
 assert.equal(can(principal,'game:score',{scopeType:'GAME',scopeId:'g'}),false);
});

test('ID-012 invalid evaluation clocks deny all grants',()=>{
 const grant={userId:'u',role:'SCOREKEEPER',scopeType:'GAME',scopeId:'g',expiresAt:'2026-01-01T00:00:00Z'};
 for(const at of [NaN,Infinity,-Infinity,null,'0',{},[],true]) {
  assert.equal(can({id:'u',grants:[grant]},'game:score',{scopeType:'GAME',scopeId:'g'},at),false);
  assert.equal(can({id:'u',grants:[initialParentGrant('u')]},'account:read',{scopeType:'USER',scopeId:'u'},at),false);
 }
});

test('ID-012 expiry boundary and seeded randomized time comparisons',()=>{
 const expiry=Date.parse('2026-01-01T00:00:00Z');
 const principal={id:'u',grants:[{userId:'u',role:'SCOREKEEPER',scopeType:'GAME',scopeId:'g',expiresAt:new Date(expiry).toISOString()}]};
 const resource={scopeType:'GAME',scopeId:'g'};
 for(const delta of [-1,0,1]) assert.equal(can(principal,'game:score',resource,expiry+delta),delta<0);
 // Fixed LCG seed makes temporal fuzz failures reproducible without wall-clock dependencies.
 let seed=0x1cebeef;
 for(let i=0;i<1000;i++) {
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const delta=(seed%2000001)-1000000;
  assert.equal(can(principal,'game:score',resource,expiry+delta),delta<0,`seed=0x1cebeef iteration=${i} delta=${delta}`);
 }
});
