'use strict';
// Sport-neutral contracts: no web, persistence, or game-hardware dependency.
// A sport module translates an immutable event envelope into a published game view.
function assertModule(m) {
  if (!m || !/^[a-z][a-z0-9-]*$/.test(m.id || '') || !Number.isInteger(m.version) || m.version < 1) throw Error('Invalid sport identity');
  if (typeof m.project !== 'function' || typeof m.describe !== 'function' || typeof m.validateEvent !== 'function') throw Error('Invalid sport module contract');
  return Object.freeze(m);
}
const registered = new Map();
function register(m) {assertModule(m);if (registered.has(m.id)) throw Error('Sport already registered: '+m.id);registered.set(m.id,m);return m;}
function get(id){const m=registered.get(id);if(!m)throw Error('Unknown sport: '+id);return m;}
function list(){return [...registered.values()].map(m=>m.describe());}
// This is a pure replay facade, not a second scoring authority. Journal events
// remain owned by the rink authority, with sequence and idempotency enforced there.
function replay({sportId,events,gameId='demo'}){
  if(!Array.isArray(events))throw Error('Events must be an array');
  const m=get(sportId);let last=0;
  for(const e of events){if(!Number.isInteger(e.seq)||e.seq!==last+1)throw Error('Noncontiguous event sequence');if(e.sportId&&e.sportId!==sportId)throw Error('Sport mismatch');m.validateEvent(e);last=e.seq;}
  return Object.freeze({sportId,gameId,moduleVersion:m.version,revision:last,...m.project(events)});
}
module.exports={assertModule,register,get,list,replay};