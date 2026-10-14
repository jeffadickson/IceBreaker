'use strict';
// Load before rink-server.js with node --require.
// Disabled by default; no external telemetry network traffic unless opted in.
// OTLP should target a localhost collector with privacy filters and TLS on
// collector->backend traffic, not a vendor endpoint from the rink laptop.
let sdk=null;
if(process.env.ICEBREAKER_OTEL_ENABLED==='1'){
 const {NodeSDK}=require('@opentelemetry/sdk-node');
 const {OTLPTraceExporter}=require('@opentelemetry/exporter-trace-otlp-http');
 const {OTLPMetricExporter}=require('@opentelemetry/exporter-metrics-otlp-http');
 const {PeriodicExportingMetricReader}=require('@opentelemetry/sdk-metrics');
 const endpoint=process.env.ICEBREAKER_OTEL_TRACES_URL||'http://127.0.0.1:4318/v1/traces';
 const url=new URL(endpoint);
 if(!['http:','https:'].includes(url.protocol))throw Error('Invalid OTLP protocol');
 if(!['localhost','127.0.0.1','::1'].includes(url.hostname))
  throw Error('Rink telemetry must use a local OpenTelemetry Collector endpoint');
 if(url.username||url.password||url.search||url.hash)throw Error('Credentials and query strings forbidden in OTLP URL');
 const metricsUrl=process.env.ICEBREAKER_OTEL_METRICS_URL||'http://127.0.0.1:4318/v1/metrics';
 const metricsEndpoint=new URL(metricsUrl);
 if(!['localhost','127.0.0.1','::1'].includes(metricsEndpoint.hostname)||!['http:','https:'].includes(metricsEndpoint.protocol)||metricsEndpoint.username||metricsEndpoint.password||metricsEndpoint.search||metricsEndpoint.hash)
  throw Error('Rink metrics must use a local Collector endpoint without credentials');
 sdk=new NodeSDK({
  serviceName:'icebreaker.rink-local',
  resourceDetectors:[],
  instrumentations:[],
  traceExporter:new OTLPTraceExporter({url:endpoint}),
  metricReader:new PeriodicExportingMetricReader({exporter:new OTLPMetricExporter({url:metricsUrl}),exportIntervalMillis:60000}),
  // No automatic HTTP, SQL, or request-body instrumentation: all attributes
  // are emitted from an explicit allowlist in telemetry.js.
 });
 sdk.start();
 const shutdown=()=>sdk.shutdown().catch(()=>{});
 process.once('SIGINT',shutdown);
 process.once('SIGTERM',shutdown);
}

module.exports={sdk};
