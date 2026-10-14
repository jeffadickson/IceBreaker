"""Read-only Frappe Bench installation preflight for fictional-data beta.

Run in a disposable Bench:
    bench --site icebreaker-dev.local execute icebreaker_league.bench_preflight.run

This checks installed app/schema and dangerous generic DocType grants only.
It does NOT certify tenant API/Desk permissions, DST parity, or a release.
"""
DOCTYPE_NAMES = (
    "IceBreaker League",
    "IceBreaker Season",
    "IceBreaker Division",
    "IceBreaker Club",
    "IceBreaker Team",
    "IceBreaker Game",
    "IceBreaker League Access",
    "IceBreaker Certified Result",
    "IceBreaker Training Course",
    "IceBreaker Training Policy",
)
REQUIRED_FIELDS = {
    "IceBreaker Game": ("icebreaker_id", "scheduled_at", "scheduled_source_iso", "scheduled_utc"),
    "IceBreaker Training Policy": ("training_course", "league", "season", "role", "renewal_mode", "revision"),
    "IceBreaker League Access": ("league", "user"),
}


def inspect_bench(frappe_module):
    """Only reads installed-app metadata, DocType metadata and Role existence."""
    checks = []
    apps = set(frappe_module.get_installed_apps())
    checks.append({
        "id": "APP_INSTALLED",
        "ok": "icebreaker_league" in apps,
        "detail": "App installed" if "icebreaker_league" in apps else "IceBreaker app missing",
    })
    for name in DOCTYPE_NAMES:
        try:
            meta = frappe_module.get_meta(name)
            missing = [field for field in REQUIRED_FIELDS.get(name, ()) if not meta.has_field(field)]
            # The development pilot intentionally grants no generic DocType
            # access to League Admin or other non-System-Manager roles.
            broad = sorted({row.role for row in meta.permissions
                            if row.role != "System Manager"
                            and any(int(getattr(row, perm, 0) or 0)
                                    for perm in ("read", "write", "create", "delete", "report", "export"))})
            checks.append({
                "id": "DOCTYPE_" + name.upper().replace(" ", "_"),
                "ok": not missing and not broad,
                "detail": "Schema and generic permissions checked" if not missing and not broad
                          else "Missing fields: " + ",".join(missing) + "; broad grants: " + ",".join(broad),
            })
        except Exception:
            # Do not return exception text: it may contain database details.
            checks.append({"id": "DOCTYPE_" + name.upper().replace(" ", "_"),
                           "ok": False, "detail": "DocType metadata unavailable"})
    checks.append({
        "id": "NARROW_LEAGUE_ROLE",
        "ok": bool(frappe_module.db.exists("Role", "IceBreaker League Admin")),
        "detail": "Scoped role exists" if frappe_module.db.exists("Role", "IceBreaker League Admin")
                  else "Scoped role missing",
    })
    return {
        "status": "PREFLIGHT_PASSED" if all(check["ok"] for check in checks) else "PREFLIGHT_FAILED",
        "checks": checks,
        "limitations": "Does not run tenant isolation, live import, DST, concurrency, signing, or cutover tests",
    }


def run():
    import frappe
    return inspect_bench(frappe)
