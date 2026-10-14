"""Privacy-safe, optional OpenTelemetry spans. No payload or SQL capture."""
from contextlib import contextmanager
from .otel_bootstrap import configure

ALLOWED_OPERATIONS = frozenset({
    "league.overview",
    "league.schedule_read",
    "league.import_preview",
    "league.import_commit",
    "league.result_receive",
    "league.rink_bundle_preview",
    "league.training_policy_read",
})
ALLOWED_OUTCOMES = frozenset({"ok", "rejected", "error"})


@contextmanager
def league_span(operation):
    if operation not in ALLOWED_OPERATIONS:
        raise ValueError("Unapproved telemetry operation")
    # Only SDK/configuration errors are isolated. Never swallow exceptions
    # thrown by the business operation inside the context.
    try:
        configure()
        from opentelemetry import trace
    except (ImportError, RuntimeError, OSError, ValueError):
        trace = None
    if trace is None:
        yield None
        return
    tracer = trace.get_tracer("icebreaker.league-frappe")
    with tracer.start_as_current_span(
        operation,
        attributes={"icebreaker.operation": operation},
    ) as span:
        yield span


def mark_outcome(span, outcome):
    if outcome not in ALLOWED_OUTCOMES:
        raise ValueError("Unapproved telemetry outcome")
    if span is not None:
        span.set_attribute("icebreaker.outcome", outcome)
