"""Conservative per-league API authorization.

Frappe DocTypes remain System-Manager-only. A league admin is allowed only
through explicitly scoped, read-only whitelisted APIs until Bench RBAC tests.
"""
import frappe

from .access_rules import LEAGUE_ADMIN_ROLE, has_scoped_access


def require_league_reader(league_id):
    if not isinstance(league_id, str) or not 2 <= len(league_id) <= 100:
        frappe.throw("Invalid league ID")
    user = frappe.session.user
    roles = frappe.get_roles(user)
    # No unscoped role-based fallback: a Frappe League Admin needs a live,
    # enabled membership for the exact requested league.
    memberships = frappe.get_all(
        "IceBreaker League Access",
        filters={"user": user, "enabled": 1},
        pluck="league", limit_page_length=500,
    ) if LEAGUE_ADMIN_ROLE in roles and "System Manager" not in roles else []
    if not has_scoped_access(user, roles, league_id, memberships):
        frappe.throw("League access denied", frappe.PermissionError)
