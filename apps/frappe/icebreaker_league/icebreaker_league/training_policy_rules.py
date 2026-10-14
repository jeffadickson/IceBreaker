"""Pure, PII-free central training policy invariants.

Frappe owns *definitions* and effective requirements, not private completion
evidence or child records. Keep the rink training ledger authoritative until
the dedicated protected registration service is production-ready.
"""
from datetime import date

ROLES = frozenset({"PLAYER", "PARENT", "GUARDIAN", "COACH", "MANAGER", "VOLUNTEER", "OFFICIAL"})
RENEWAL_MODES = frozenset({"ONCE", "ANNUAL_CALENDAR", "ANNUAL_SEASON", "ROLLING_DAYS"})


def iso_day(value):
    if isinstance(value, date):
        return value.isoformat()
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError("Expected YYYY-MM-DD")
    try:
        day = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Invalid training policy date") from exc
    if day.isoformat() != value:
        raise ValueError("Noncanonical training policy date")
    return value


def validate_policy_values(*, role, renewal_mode, validity_days,
                           effective_from, effective_to=None, required=True,
                           season_id=None):
    if role not in ROLES:
        raise ValueError("Unknown participant role")
    if renewal_mode not in RENEWAL_MODES:
        raise ValueError("Unknown renewal mode")
    start = iso_day(effective_from)
    if effective_to:
        end = iso_day(effective_to)
        if end < start:
            raise ValueError("Effective end precedes start")
    if renewal_mode == "ROLLING_DAYS":
        if type(validity_days) is not int or not 1 <= validity_days <= 3650:
            raise ValueError("Rolling renewal requires 1-3650 validity days")
    elif validity_days not in (None, ""):
        raise ValueError("Validity days allowed only for rolling renewal")
    if renewal_mode == "ANNUAL_SEASON" and not season_id:
        raise ValueError("Season renewal requires a season")
    if type(required) is not bool:
        raise ValueError("Required flag must be boolean")
    return {"role": role, "renewal_mode": renewal_mode,
            "validity_days": validity_days if renewal_mode == "ROLLING_DAYS" else None,
            "effective_from": start, "effective_to": effective_to or None,
            "required": required, "season_id": season_id or None}


def validate_revision(previous, new, *, same_scope=True):
    """A revision must not silently rewrite an earlier effective policy."""
    if not same_scope:
        raise ValueError("Cannot revise a different policy scope")
    if type(new["revision"]) is not int or new["revision"] < 1:
        raise ValueError("Invalid revision")
    if previous is None:
        if new["revision"] != 1:
            raise ValueError("First policy revision must be 1")
        return
    if new["revision"] != previous["revision"] + 1:
        raise ValueError("Revision must advance exactly once")
    if iso_day(new["effective_from"]) <= iso_day(previous["effective_from"]):
        raise ValueError("New revision must have a later effective date")


def choose_effective_policy(revisions, at_date):
    """Pure policy selection for one course/scope/role/season, not completion."""
    day = iso_day(at_date)
    eligible = [r for r in revisions if
                iso_day(r["effective_from"]) <= day and
                (not r.get("effective_to") or iso_day(r["effective_to"]) >= day)]
    if not eligible:
        return None
    return max(eligible, key=lambda r: (r["effective_from"], r["revision"]))
