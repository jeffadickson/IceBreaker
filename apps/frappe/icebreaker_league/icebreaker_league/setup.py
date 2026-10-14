"""Create the narrow IceBreaker League Admin role, with no DocType grants.

It receives access only to explicit whitelisted league read APIs after a
System Manager assigns both the role and a league membership record.
"""
import frappe

ROLE = "IceBreaker League Admin"


def ensure_roles():
    if not frappe.db.exists("Role", ROLE):
        frappe.get_doc({"doctype": "Role", "role_name": ROLE, "desk_access": 0}).insert(
            ignore_permissions=True
        )


def after_install():
    ensure_roles()
