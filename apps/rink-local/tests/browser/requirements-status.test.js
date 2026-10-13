'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const tracker=require('../../tools/requirements-status');
test('requirements status detects duplicate StrictDoc IDs and incomplete migration',()=>{
 const result=tracker.summarize(tracker.read());
 assert.equal(result.baselineRequirements,116);
 assert.equal(result.proposedRequirements,133);
 assert.ok(result.strictDocEntries>=43);
 assert.ok(result.uniqueStrictDocIds>=35);
 assert.ok(result.duplicateIds.includes('LEAGUE-001'));
 assert.ok(result.conflicts.some(x=>x.id==='LEAGUE-001'));
 assert.ok(result.missingTrace.includes('LEAGUE-012'));
 assert.ok(result.baselineIdsNotInStrictDoc.includes('PLT-001'));
 assert.equal(result.note.includes('NOT verification evidence'),true);
});
test('requirements status parser extracts stable UID and statement',()=>{
 const items=tracker.parseSdoc('[REQUIREMENT]\nUID: DEMO-001\nTITLE: Test\nSTATEMENT: Must pass.\n[/REQUIREMENT]','demo.sdoc');
 assert.deepEqual(items,[{id:'DEMO-001',source:'demo.sdoc',title:'Test',statement:'Must pass.'}]);
});
