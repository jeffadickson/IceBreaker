'use strict';
// Load before rink-server.js with node --require.
// Disabled by default; no external telemetry network traffic unless opted in.
// OTLP should target a localhost collector with privacy filters and TLS on
// collector->backend traffic, not a vendor endpoint from the rink laptop.
if(process.env.ICEBREAKER_OTEL_ENABLED==='1'){
 const {NodeSDK}=require('@opentelemetry/sdk-node');
 const {OTLPTraceExporter}=require('@opentelemetry/exporter-trace-otlp-http');
 const endpoint=process.env.ICEBREAKER_OTEL_TRACES_URL||'http://127.0.0.1:4318/v1/traces';
 const url=new URL(endpoint);
 if(!['http:','https:'].includes(url.protocol))throw Error('Invalid OTLP protocol');
 if(!['localhost','127.0.0.1','::1'].includes(url.hostname))
  throw Error('Rink telemetry must use a local OpenTelemetry Collector endpoint');
 if(url.username||url.password||url.search||url.hash)throw Error('Credentials and query strings forbidden in OTLP URL');
 const sdk=new NodeSDK({
  serviceName:'icebreaker.rink-local',
  traceExporter:new OTLPTraceExporter({url:endpoint}),
  // No automatic HTTP, SQL, or request-body instrumentation: all attributes
  // are emitted from an explicit allowlist in telemetry.js.
 });
 sdk.start();
 const shutdown=()=>sdk.shutdown().catch(()=>{});
 process.once('SIGINT',shutdown);
 process.once('SIGTERM',shutdown);
}
