import { Request, Response, NextFunction } from 'express';
import { tokenService } from '../services/token.service';
import { apiKeyRepository } from '../repositories/api-key.repository';
import { userRepository } from '../repositories/user.repository';
import { UnauthorizedError } from '../utils/errors';
import crypto from 'crypto';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for public routes
  const publicPaths = [
    '/api/v1/auth/register',
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/api/v1/auth/oauth',
    '/api/v1/auth/verify-email',
    '/health',
    '/metrics',
    '/api/docs',
    '/api/v1/openapi.json',
  ];

  if (publicPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string;

  if (apiKeyHeader) {
    // API key auth
    handleApiKeyAuth(apiKeyHeader, req)
      .then(() => next())
      .catch(next);
    return;
  }

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = tokenService.validateAccessToken(token);
      req.userId = payload.sub;
      req.userRoles = payload.roles;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  next(new UnauthorizedError('Authentication required'));
}

async function handleApiKeyAuth(apiKey: string, req: Request): Promise<void> {
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const stored = await apiKeyRepository.findByHash(keyHash);

  if (!stored) {
    throw new UnauthorizedError('Invalid API key');
  }

  if (stored.expires_at && new Date(stored.expires_at) < new Date()) {
    throw new UnauthorizedError('API key has expired');
  }

  // Update last used (fire-and-forget)
  apiKeyRepository.updateLastUsed(stored.id).catch(() => {});

  // Get user roles
  const roles = await userRepository.getUserRoles(stored.user_id);
  req.userId = stored.user_id;
  req.userRoles = roles;
}
