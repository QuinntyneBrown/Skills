import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const correlationId = req.correlationId || 'unknown';

  if (err instanceof AppError) {
    const severity = err.statusCode >= 500 ? 'error' : 'warn';
    logger[severity]('Request error', {
      correlation_id: correlationId,
      status_code: err.statusCode,
      code: err.code,
      message: err.message,
      path: req.path,
      method: req.method,
    });

    const body: any = {
      error: {
        code: err.code,
        message: err.message,
        correlation_id: correlationId,
      },
    };
    if (err.details.length > 0) {
      body.error.details = err.details;
    }
    if ('retryAfter' in err) {
      res.setHeader('Retry-After', String((err as any).retryAfter));
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // Unhandled error
  logger.error('Unhandled error', {
    correlation_id: correlationId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      correlation_id: correlationId,
    },
  });
}
