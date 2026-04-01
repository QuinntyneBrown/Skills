import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index';
import { refreshTokenRepository } from '../repositories/refresh-token.repository';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';

export interface AccessTokenPayload {
  sub: string;
  roles: string[];
  iat: number;
  exp: number;
}

export class TokenService {
  issueAccessToken(userId: string, roles: string[]): string {
    const payload = { sub: userId, roles };
    return jwt.sign(payload, config.jwt.privateKey(), {
      algorithm: 'RS256',
      expiresIn: config.jwt.accessTokenExpiry,
    });
  }

  validateAccessToken(token: string): AccessTokenPayload {
    try {
      return jwt.verify(token, config.jwt.publicKey(), {
        algorithms: ['RS256'],
      }) as AccessTokenPayload;
    } catch (err) {
      throw new UnauthorizedError('Invalid or expired access token');
    }
  }

  async issueRefreshToken(userId: string, familyId?: string): Promise<{ token: string; familyId: string }> {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const fId = familyId || uuidv4();
    const expiresAt = new Date(Date.now() + config.jwt.refreshTokenExpiry * 1000);

    await refreshTokenRepository.create(userId, tokenHash, fId, expiresAt);

    // Also cache in Redis for fast lookup
    try {
      const redis = getRedis();
      await redis.set(
        `refresh:${tokenHash}`,
        JSON.stringify({ userId, familyId: fId }),
        'EX',
        config.jwt.refreshTokenExpiry
      );
    } catch (err) {
      logger.warn('Failed to cache refresh token in Redis', { error: (err as Error).message });
    }

    return { token: rawToken, familyId: fId };
  }

  async rotateRefreshToken(oldRawToken: string): Promise<{ accessToken: string; refreshToken: string; userId: string; roles?: string[] }> {
    const oldHash = this.hashToken(oldRawToken);
    const stored = await refreshTokenRepository.findByHash(oldHash);

    if (!stored) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (stored.revoked_at) {
      // Token reuse detected - revoke entire family
      logger.warn('Refresh token reuse detected, revoking family', {
        familyId: stored.family_id,
        userId: stored.user_id,
      });
      await refreshTokenRepository.revokeFamily(stored.family_id);
      throw new UnauthorizedError('Token reuse detected. All sessions revoked.');
    }

    if (new Date(stored.expires_at) < new Date()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    // Revoke old token
    await refreshTokenRepository.markRevoked(stored.id);
    try {
      const redis = getRedis();
      await redis.del(`refresh:${oldHash}`);
    } catch {}

    // Issue new refresh token in same family
    const { token: newRefreshToken } = await this.issueRefreshToken(stored.user_id, stored.family_id);

    // We need the caller to provide roles for the access token
    // Return userId so caller can look up roles
    return {
      accessToken: '', // Caller will set this after looking up roles
      refreshToken: newRefreshToken,
      userId: stored.user_id,
    };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const hash = this.hashToken(rawToken);
    const stored = await refreshTokenRepository.findByHash(hash);
    if (stored) {
      await refreshTokenRepository.markRevoked(stored.id);
      try {
        const redis = getRedis();
        await redis.del(`refresh:${hash}`);
      } catch {}
    }
  }

  async revokeAllTokens(userId: string): Promise<void> {
    await refreshTokenRepository.revokeAllByUser(userId);
    // Bulk Redis cleanup would require scanning, skip for simplicity
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export const tokenService = new TokenService();
