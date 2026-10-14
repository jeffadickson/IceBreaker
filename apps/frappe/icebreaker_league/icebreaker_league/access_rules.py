"""Pure authorization rule: roles alone do not grant league data access."""
LEAGUE_ADMIN_ROLE = "IceBreaker League Admin"


def has_scoped_access(user, roles, league_id, enabled_memberships):
    if not user or user == "Guest":
        return False
    if "System Manager" in roles:
        return True
    return LEAGUE_ADMIN_ROLE in roles and league_id in enabled_memberships
