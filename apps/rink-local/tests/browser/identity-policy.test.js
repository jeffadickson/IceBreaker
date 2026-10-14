'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {can,initialParentGrant}=require('../../server/identity-policy');
test('new parent can only access own account actions',()=>{
 const id='u1',principal={id,grants:[initialParentGrant(id)]};
 assert.equal(can(principal,'account:read',{scopeType:'PLATFORM',scopeId:'*'}),true);
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
 assert.equal(can({id:'root',mfaVerified:true,grants:[grant]},'platform:admin',{}),true);
 assert.equal(can({id:'root',mfaVerified:true,grants:[initialParentGrant('root')]},'platform:admin',{}),false);
});
