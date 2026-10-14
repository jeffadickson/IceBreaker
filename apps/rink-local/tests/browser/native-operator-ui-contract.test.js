'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../../src/Icebreaker.Timekeeper.Desktop/TimekeeperWindow.cs');
const code=fs.readFileSync(file,'utf8');
test('native console is main-screen-first with team-prefilled modal actions, not tabs',()=>{
 assert.match(code,/PopupButton\("HOME GOAL"/);
 assert.match(code,/PopupButton\("AWAY GOAL"/);
 assert.match(code,/PopupButton\("HOME PENALTY"/);
 assert.match(code,/PopupButton\("AWAY PENALTY"/);
 assert.match(code,/PopupButton\("HOME GOALIE"/);
 assert.match(code,/PopupButton\("AWAY GOALIE"/);
 assert.match(code,/ShowPanelAsync\(string title, Control panel\)/);
 assert.match(code,/await dialog\.ShowDialog\(this\)/);
 assert.doesNotMatch(code,/new TabControl/);
});
test('draft editing does not send an event until commit and validation errors keep popup open',()=>{
 assert.match(code,/if \(await ExecuteAsync\(action\) && closeOnSuccess\) _activeDialog\?\.Close\(\)/);
 assert.match(code,/dismiss\.Click \+= \(_, _\) => dialog\.Close\(\)/);
 assert.match(code,/if \(_goalConfirm\.IsChecked != true\)/);
 assert.match(code,/type = "GOAL_RECORDED"/);
 assert.match(code,/type = "PENALTY_ASSESSED"/);
 assert.match(code,/type = "GOALIE_CHANGED"/);
});
test('post-commit goal correction is reasoned and references original journal event',()=>{
 assert.match(code,/type = "GOAL_ATTRIBUTION_CORRECTED", originalEventId = goal\.Id/);
 assert.match(code,/A correction reason is required/);
 assert.match(code,/PopulateGoalCorrections/);
 assert.match(code,/EventDetail\(latest, "scorer"\)/);
 assert.match(code,/PopupButton\("CORRECT GOAL"/);
});

test('command completion releases busy guard before authoritative refresh',()=>{
 const execute=code.slice(code.indexOf('private async Task<bool> ExecuteAsync'),code.indexOf('private async void OnKeyDown'));
 assert.match(execute,/finally\s*\{\s*\/\/[^\n]*\n(?:[^\n]*\n)*?\s*_busy = false;\s*await RefreshAsync\(\);/);
});
test('space shortcut cannot change clock while an entry dialog is open',()=>{
 assert.match(code,/if \(_activeDialog is not null \|\| e\.Key != Key\.Space/);
});

test('native roster lookup uses authenticated authority and preserves server validation',()=>{
 const client=fs.readFileSync(path.resolve(__dirname,'../../src/Icebreaker.Core/Integration/RinkClockClient.cs'),'utf8');
 assert.match(client,/GameRostersAsync\(/);
 assert.match(client,/\/api\/operator\/game-rosters/);
 assert.match(client,/X-Operator-Key/);
 assert.match(code,/LoadRosterSuggestionsAsync\("home"\)/);
 assert.match(code,/LoadRosterSuggestionsAsync\("away"\)/);
 assert.match(code,/GetProperty\("eligible"\)/);
});
test('native penalty dialog exposes authority-supported classifications and coincidental flag',()=>{
 assert.match(code,/"DOUBLE_MINOR", "MAJOR", "MISCONDUCT", "GAME_MISCONDUCT", "MATCH", "OTHER"/);
 assert.match(code,/coincidental = _penaltyCoincidental.IsChecked == true/);
 assert.match(code,/classification = _penaltyClass.SelectedItem/);
});

test('roster-backed player pickers cover scoring, penalties, goalies and corrections',()=>{
 for (const label of ['Scorer','Assist 1','Assist 2','Goalie','Penalty player','Correct scorer','Correct assist 1','Correct assist 2'])
   assert.ok(code.includes('PlayerPicker(') && code.includes('"'+label+'"'),label);
 assert.match(code,/ApplyRosterChoices\(side, team.GetProperty\("players"\)\)/);
 assert.match(code,/new RosterChoice\("NONE"/);
 assert.match(code,/new RosterChoice\("EMPTY"/);
 assert.match(code,/selector.ItemsSource = special.Concat\(choices\).ToArray\(\)/);
});
