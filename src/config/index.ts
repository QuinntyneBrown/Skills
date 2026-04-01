import fs from 'fs';
import path from 'path';

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function envInt(key: string, fallback?: number): number {
  const raw = process.env[key];
  if (raw !== undefined) return parseInt(raw, 10);
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

function loadKey(pathOrValue: string): string {
  if (pathOrValue.startsWith('-----')) return pathOrValue;
  const resolved = path.resolve(pathOrValue);
  if (fs.existsSync(resolved)) return fs.readFileSync(resolved, 'utf-8');
  return pathOrValue;
}

export const config = {
  env: env('NODE_ENV', 'development'),
  isProduction: env('NODE_ENV', 'development') === 'production',

  api: {
    port: envInt('API_PORT', 3000),
    host: env('API_HOST', '0.0.0.0'),
  },

  db: {
    host: env('DB_HOST', 'localhost'),
    port: envInt('DB_PORT', 5432),
    database: env('DB_NAME', 'skills'),
    user: env('DB_USER', 'app'),
    password: env('DB_PASSWORD', 'changeme'),
    poolMin: envInt('DB_POOL_MIN', 2),
    poolMax: envInt('DB_POOL_MAX', 20),
    idleTimeoutMs: envInt('DB_POOL_IDLE_TIMEOUT_MS', 10000),
    acquireTimeoutMs: envInt('DB_POOL_ACQUIRE_TIMEOUT_MS', 5000),
  },

  redis: {
    host: env('REDIS_HOST', 'localhost'),
    port: envInt('REDIS_PORT', 6379),
    db: envInt('REDIS_DB', 0),
  },

  jwt: {
    privateKey: () => loadKey(env('JWT_PRIVATE_KEY_PATH', './keys/private.pem')),
    publicKey: () => loadKey(env('JWT_PUBLIC_KEY_PATH', './keys/public.pem')),
    accessTokenExpiry: envInt('JWT_ACCESS_TOKEN_EXPIRY', 900),
    refreshTokenExpiry: envInt('JWT_REFRESH_TOKEN_EXPIRY', 604800),
  },

  oauth: {
    github: {
      clientId: env('GITHUB_CLIENT_ID', ''),
      clientSecret: env('GITHUB_CLIENT_SECRET', ''),
    },
    google: {
      clientId: env('GOOGLE_CLIENT_ID', ''),
      clientSecret: env('GOOGLE_CLIENT_SECRET', ''),
    },
    redirectUri: env('OAUTH_REDIRECT_URI', 'http://localhost:3000/api/v1/auth/oauth/callback'),
  },

  cors: {
    allowedOrigins: env('CORS_ALLOWED_ORIGINS', 'http://localhost:5173').split(','),
  },

  logging: {
    level: env('LOG_LEVEL', 'info'),
  },

  metrics: {
    port: envInt('METRICS_PORT', 9090),
  },

  rateLimit: {
    authenticated: { maxRequests: 1000, windowMs: 60_000 },
    unauthenticated: { maxRequests: 200, windowMs: 60_000 },
    auth: { maxRequests: 200, windowMs: 60_000 },
  },

  cache: {
    skillTtl: 300,
    listTtl: 120,
    searchTtl: 60,
  },
} as const;
