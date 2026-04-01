import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
  registers: [register],
});

export const dbActiveConnections = new client.Gauge({
  name: 'db_active_connections',
  help: 'Active database connections',
  registers: [register],
});

export const dbIdleConnections = new client.Gauge({
  name: 'db_idle_connections',
  help: 'Idle database connections',
  registers: [register],
});

export const cacheHitsTotal = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  registers: [register],
});

export const cacheMissesTotal = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  registers: [register],
});

export const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total HTTP errors',
  labelNames: ['status_code'],
  registers: [register],
});

export { register as metricsRegistry };
