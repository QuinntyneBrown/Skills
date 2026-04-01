import express from 'express';
import cors from 'cors';
import { config } from './config/index';
import {
  correlationIdMiddleware,
  securityHeadersMiddleware,
  rateLimitMiddleware,
  authMiddleware,
  sanitizeBody,
  errorHandler,
  loggingMiddleware,
} from './middleware/index';
import { authRouter, skillRouter, versionRouter, healthRouter, auditRouter } from './controllers/index';
import { httpRequestsTotal, httpRequestDuration } from './services/metrics.service';
import { NotFoundError } from './utils/errors';

export function createApp(): express.Application {
  const app = express();

  // --- Middleware pipeline (order matters) ---

  // 1. Correlation ID
  app.use(correlationIdMiddleware);

  // 2. Request logging (early to capture all requests)
  app.use(loggingMiddleware);

  // 3. CORS
  app.use(
    cors({
      origin: config.cors.allowedOrigins,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-CSRF-Token', 'X-API-Key', 'X-Request-ID'],
      exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Correlation-ID'],
      credentials: true,
      maxAge: 86400,
    })
  );

  // 4. Security headers
  app.use(securityHeadersMiddleware);

  // 5. Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  // 6. Input sanitization
  app.use(sanitizeBody);

  // 7. Metrics collection
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path;
      httpRequestsTotal.inc({ method: req.method, path: route, status_code: res.statusCode });
      httpRequestDuration.observe({ method: req.method, path: route }, duration);
    });
    next();
  });

  // 8. Auth middleware
  app.use(authMiddleware);

  // 9. Rate limiting (after auth so we can use userId)
  app.use(rateLimitMiddleware);

  // --- Routes ---

  // Health & metrics (mounted at root)
  app.use(healthRouter);

  // API v1 routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/skills', skillRouter);
  app.use('/api/v1/skills', versionRouter);
  app.use('/api/v1/audit-logs', auditRouter);

  // API docs placeholder
  app.get('/api/docs', (_req, res) => {
    res.status(200).json({ message: 'API documentation - integrate Swagger UI here', openapi: '/api/v1/openapi.json' });
  });

  app.get('/api/v1/openapi.json', (_req, res) => {
    res.status(200).json({
      openapi: '3.0.3',
      info: { title: 'Skills API', version: '1.0.0', description: 'Claude Skills management platform API' },
      servers: [{ url: '/api/v1' }],
      paths: {},
    });
  });

  // 404 for unmatched routes
  app.use((_req, _res, next) => {
    next(new NotFoundError('Endpoint not found. See /api/docs for available endpoints.'));
  });

  // --- Error handler (must be last) ---
  app.use(errorHandler);

  return app;
}
