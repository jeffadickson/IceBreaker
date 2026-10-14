'use strict';
// Optional Logfire bootstrap. Load before the application modules.
// Never enable this on a rink authority without approved telemetry policy.
if (process.env.ICEBREAKER_LOGFIRE_ENABLED === '1') {
  if (!process.env.LOGFIRE_TOKEN) {
    throw new Error('LOGFIRE_TOKEN is required when ICEBREAKER_LOGFIRE_ENABLED=1');
  }
  let logfire;
  try {
    logfire = require('@pydantic/logfire-node');
  } catch {
    throw new Error('Install @pydantic/logfire-node before enabling Logfire');
  }
  // Only explicit, allowlisted manual events in the pilot; no automatic HTTP,
  // SQL, filesystem, or browser instrumentation containing private information.
  logfire.configure({
    serviceName: 'icebreaker-rink-local',
    environment: process.env.ICEBREAKER_ENV || 'development',
    metrics: false
  });
  logfire.info('icebreaker telemetry bootstrap', {
    deployment: 'rink-local',
    event_type: 'telemetry_enabled'
  });
}
