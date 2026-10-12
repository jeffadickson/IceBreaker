# Icebreaker League Center — v1.0 development slice

## Existing requirements
- WEB-004: publish league schedules, standings, live and certified scores distinctly.
- WEB-005: compute certified season standings and player statistics from versioned records.
- ROS-006: persistent participant IDs independent of jersey changes.
- TRN-010: versioned standings and tiebreak policies.

## New requirements
StrictDoc `LEAGUE-001` through `LEAGUE-008` are appended in `requirements/icebreaker-live.sdoc` and referenced in `requirements/traceability.csv`.

## Implementation boundaries
- `server/league-data.js`: deterministic fictional fixture projection; validates goal totals vs certified game scores. Not a real league datastore.
- `GET /api/league/v1/overview`: read-only demonstration league summary; live-score segment uses the local game authority.
- `web/league.html`, `web/league.js`: overview, schedule by team/status, standings, players by team/search, links to parent Live tracker.
- `tests/browser/league.test.js`: reconciliation, certified-only separation, stable identity, error cases, public read-only endpoint.

## Before a real league deployment
1. Postgres storage and schedule-revision/assignment schema; per-division leagues, season memberships and configuration.
2. Real official event upload from game authority, results certification workflow, voided goals and corrected scorer/assists, and replayable projections.
3. Production standings engine with versioned rules for overtime, forfeits, fair-play, head-to-head and differential caps; ranking tie policies.
4. Public player visibility/guardian consent and role-based access, pseudonyms as needed, team roster lifecycle.
5. Pagination, caching, ETag/API versioning, SSE data freshness, load testing, CI browser e2e, accessibility audit.
6. Publishing: domain/TLS, deployment, rate limits, observability, backups, data retention.

## Verification
Run `node --test tests/browser/*.test.js` from project root. At packaging, 47 tests pass. This is a demonstration vertical slice, not league-ready deployment.
