"""Optional, local-collector-only OTel SDK configuration for Frappe workers.

Call once lazily. This does not instrument HTTP, SQL, requests, or private
documents. An unavailable collector must never affect business transactions.
"""
import os
import threading
from urllib.parse import urlsplit

_lock = threading.Lock()
_configured = False


def collector_endpoint():
    raw = os.environ.get("ICEBREAKER_FRAPPE_OTLP_TRACES_URL", "http://127.0.0.1:4318/v1/traces")
    url = urlsplit(raw)
    if (url.scheme not in ("http", "https")
            or url.hostname not in ("localhost", "127.0.0.1", "::1")
            or url.username or url.password or url.query or url.fragment
            or url.path != "/v1/traces"):
        raise ValueError("Frappe telemetry requires a local OTLP HTTP Collector")
    return raw


def configure():
    global _configured
    if os.environ.get("ICEBREAKER_FRAPPE_OTEL_ENABLED") != "1":
        return False
    if _configured:
        return True
    with _lock:
        if _configured:
            return True
        endpoint = collector_endpoint()
        try:
            from opentelemetry import trace
            from opentelemetry.sdk.resources import Resource
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        except ImportError:
            return False
        provider = TracerProvider(resource=Resource.create({
            "service.name": "icebreaker.league-frappe",
        }))
        provider.add_span_processor(BatchSpanProcessor(
            OTLPSpanExporter(endpoint=endpoint, timeout=2),
            max_queue_size=256,
            max_export_batch_size=64,
        ))
        trace.set_tracer_provider(provider)
        _configured = True
        return True
