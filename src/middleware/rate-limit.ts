import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../config/redis';
import { config } from '../config/index';
import { RateLimitedError } from '../utils/errors';
import { logger } from '../utils/logger';

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const isAuth = !!req.userId;
  const key = isAuth ? `rl:user:${req.userId}` : `rl:ip:${req.ip}`;
  const limit = isAuth
    ? config.rateLimit.authenticated.maxRequests
    : config.rateLimit.unauthenticated.maxRequests;
  const windowMs = isAuth
    ? config.rateLimit.authenticated.windowMs
    : config.rateLimit.unauthenticated.windowMs;

  const now = Date.now();
  const windowStart = now - windowMs;

  const redis = getRedis();

  redis.pipeline()
    .zremrangebyscore(key, 0, windowStart)
    .zadd(key, now.toString(), `${now}:${Math.random()}`)
    .zcard(key)
    .expire(key, Math.ceil(windowMs / 1000))
    .exec()
    .then((results) => {
      if (!results) return next();

      const count = results[2]?.[1] as number;
      const remaining = Math.max(0, limit - count);
      const resetTime = Math.ceil((now + windowMs) / 1000);

      res.setHeader('X-RateLimit-Limit', limit.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', resetTime.toString());

      if (count > limit) {
        const retryAfter = Math.ceil(windowMs / 1000);
        res.setHeader('Retry-After', retryAfter.toString());
        return next(new RateLimitedError(retryAfter));
      }

      next();
    })
    .catch((err) => {
      // Fail open if Redis is unavailable
      logger.warn('Rate limiting failed, allowing request', { error: (err as Error).message });
      next();
    });
}
