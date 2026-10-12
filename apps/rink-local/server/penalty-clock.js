'use strict';
// Deterministic projection from the authoritative, append-only journal.
// Times are GAME seconds, never wall time. Goals only terminate an eligible
// minor when the scoring team has a manpower advantage immediately before it.
const SERVED = new Set(['MINOR', 'DOUBLE_MINOR', 'MAJOR']);
const isStrength = p => SERVED.has(p.classification) && !p.coincidental;
function penaltyClock(events, currentPeriod, currentSeconds, periodSeconds = 900) {
  let period = 1, seconds = periodSeconds, played = 0;
  const penalties = [];
  const shift = (p, s, isSet = false) => {
    if (!isSet) {
      if (p === period && s < seconds) played += seconds - s;
      else if (p > period) played += seconds; // remaining clock from previous period
    }
    period = p; seconds = s;
  };
  const remainingAt = p => Math.max(0, p.duration - (played - p.startedAt) - p.terminatedSeconds);
  const strengthAt = () => {
    const v = {home: 5, away: 5};
    for (const side of ['home', 'away']) {
      const active = penalties.filter(p => p.team === side && isStrength(p) && remainingAt(p) > 0);
      v[side] = Math.max(3, 5 - active.length);
    }
    return v;
  };
  const sideOf = x => x === 'home' ? 'away' : 'home';
  for (const e of events) {
    if (!Number.isInteger(e.period) || !Number.isFinite(e.seconds)) continue;
    shift(e.period, e.seconds, e.type === 'CLOCK_UPDATED' && e.details?.action === 'SET');
    if (e.type === 'PENALTY_ASSESSED') {
      const d = e.details || {};
      const classification = d.classification || 'MINOR';
      const duration = Number(d.duration);
      if (!['home', 'away'].includes(e.team) || !Number.isFinite(duration) || duration <= 0) continue;
      const coincidental = d.coincidental === true;
      penalties.push({id:e.id,team:e.team,player:d.player,infraction:d.infraction,classification,duration,startedAt:played,terminatedSeconds:0,coincidental});
    } else if (e.type === 'GOAL_RECORDED' && ['home', 'away'].includes(e.team)) {
      const strength = strengthAt();
      const opponent = sideOf(e.team);
      if (strength[e.team] > strength[opponent]) {
        const eligible = penalties.filter(p => p.team === opponent && isStrength(p) &&
          ['MINOR','DOUBLE_MINOR'].includes(p.classification) && remainingAt(p) > 0);
        // First eligible unexpired penalty; majors are never cut short.
        eligible.sort((a,b) => a.startedAt - b.startedAt);
        const p = eligible[0];
        if (p) {
          const remaining = remainingAt(p);
          // A double minor releases just the active two-minute segment.
          const segment = p.classification === 'DOUBLE_MINOR' && remaining > 120 ? remaining - 120 : remaining;
          p.terminatedSeconds += segment;
        }
      }
    }
  }
  shift(currentPeriod, currentSeconds);
  const active = penalties.map(p => ({id:p.id,team:p.team,player:p.player,infraction:p.infraction,
    classification:p.classification,duration:p.duration,coincidental:p.coincidental,
    remaining:remainingAt(p),countsForStrength:isStrength(p)})).filter(p => p.remaining > 0);
  const teamStrength = strengthAt();
  return {active,teamStrength,powerPlay:teamStrength.home > teamStrength.away ? 'home' : teamStrength.away > teamStrength.home ? 'away' : null,playedSeconds:played,
    limitations:'Coincidental offset requires explicit flag; delayed penalty enforcement, penalty queueing and advanced league-specific rules are not implemented'};
}
module.exports = {penaltyClock};