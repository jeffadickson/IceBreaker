'use strict';
// Pure, deny-by-default ICEBREAKER authorization policy.
// This module does not authenticate callers. Only the trusted server may supply
// an authenticated principal and grants loaded from its own durable database.
const SCOPES = new Set(['PLATFORM', 'LEAGUE', 'TEAM', 'RINK', 'GAME', 'GUARDIAN_CHILD']);
const ROLES = new Set(['PARENT', 'COACH', 'TEAM_MANAGER', 'REGISTRAR', 'LEAGUE_ADMIN', 'REFEREE', 'SCOREKEEPER', 'PLATFORM_SUPERUSER']);
const PERMISSIONS = Object.freeze({
  PARENT: ['account:read', 'account:update'],
  COACH: ['team:read', 'lineup:submit'],
  TEAM_MANAGER: ['team:read', 'lineup:submit'],
  REGISTRAR: ['registration:read', 'registration:review'],
  LEAGUE_ADMIN: ['league:read', 'league:configure', 'membership:manage'],
  REFEREE: ['game:read', 'scoresheet:review', 'scoresheet:certify'],
  SCOREKEEPER: ['game:read', 'game:score', 'game:clock'],
  PLATFORM_SUPERUSER: ['platform:admin']
});
function can(principal, action, resource, at = Date.now()) {
  if (!principal || principal.disabled || !principal.id || !resource || !action) return false;
  const grants = Array.isArray(principal.grants) ? principal.grants : [];
  return grants.some(g => {
    if (!g || !ROLES.has(g.role) || !SCOPES.has(g.scopeType)) return false;
    if (g.revokedAt || (g.expiresAt && Date.parse(g.expiresAt) <= at)) return false;
    if (g.userId !== principal.id || !PERMISSIONS[g.role].includes(action)) return false;
    if (g.role === 'PLATFORM_SUPERUSER')
      return g.scopeType === 'PLATFORM' && g.scopeId === '*' && principal.mfaVerified === true;
    if (g.scopeType === 'PLATFORM') return g.role === 'PARENT' && g.scopeId === '*' && action.startsWith('account:');
    if (!resource.scopeType || !resource.scopeId) return false;
    return g.scopeType === resource.scopeType && g.scopeId === resource.scopeId;
  });
}
function initialParentGrant(userId) {
  if (typeof userId !== 'string' || !userId) throw Error('Stable user ID required');
  return Object.freeze({ userId, role: 'PARENT', scopeType: 'PLATFORM', scopeId: '*', revokedAt: null });
}
module.exports = { can, initialParentGrant, ROLES, SCOPES, PERMISSIONS };
