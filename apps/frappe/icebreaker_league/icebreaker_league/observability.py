"""PII-safe, optional OpenTelemetry manual spans for central Frappe operations.

No automatic SQL/HTTP instrumentation: URLs, request bodies and Frappe
documents may contain private youth records. Telemetry must never gate writes.
"""
from contextlib import contextmanager

ALLOWED_OPERATIONS = frozenset({
    "league.overview",
    "league.schedule_read",
    "league.import_preview",
    "league.import_commit",
    "league.result_receive",
})
ALLOWED_OUTCOMES = frozenset({"ok", "rejected", "error"})


@contextmanager
def league_span(operation):
    if operation not in ALLOWED_OPERATIONS:
        raise ValueError("Unapproved telemetry operation")
    try:
        from opentelemetry import trace
        tracer = trace.get_tracer("icebreaker.league-frappe")
        with tracer.start_as_current_span(
            operation,
            attributes={"icebreaker.operation": operation},
        ) as span:
            yield span
    except ImportError:
        yield None


def mark_outcome(span, outcome):
    if outcome not in ALLOWED_OUTCOMES:
        raise ValueError("Unapproved telemetry outcome")
    if span is not None:
        span.set_attribute("icebreaker.outcome", outcome)
