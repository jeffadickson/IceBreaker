"""PII-free, deterministic selection of effective training requirements.

Pure Python: intentionally usable in CI without importing Frappe.
"""
from .training_policy_rules import choose_effective_policy


def select_policies(rows, season_id, at_date):
    """A season-specific policy overrides an effective general policy."""
    selected = {}
    for row in rows:
        if row.get("season") not in (None, "", season_id):
            continue
        key = (row["training_course"], row["role"])
        selected.setdefault(key, []).append({
            **row, "effective_from": str(row["effective_from"]),
            "effective_to": str(row["effective_to"]) if row.get("effective_to") else None,
        })
    result = []
    for (course, role), policies in selected.items():
        seasonal = [p for p in policies if p.get("season") == season_id] if season_id else []
        general = [p for p in policies if not p.get("season")]
        choice = choose_effective_policy(seasonal, at_date) or choose_effective_policy(general, at_date)
        if choice:
            result.append({
                "training_course": course, "role": role,
                "renewal_mode": choice["renewal_mode"],
                "validity_days": choice["validity_days"],
                "required": bool(choice["required"]),
                "effective_from": choice["effective_from"],
                "effective_to": choice["effective_to"],
                "revision": int(choice["revision"]),
                "season": choice.get("season") or None,
            })
    return sorted(result, key=lambda r: (r["role"], r["training_course"]))
