import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const severity = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[severity]('HTTP request', {
      correlation_id: req.correlationId,
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      duration_ms: duration,
      user_id: req.userId || null,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
    });
  });

  next();
}
