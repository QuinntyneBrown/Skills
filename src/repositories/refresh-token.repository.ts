import { query, queryOne } from '../config/database';
import { RefreshToken } from '../models/user';

export class RefreshTokenRepository {
  async create(userId: string, tokenHash: string, familyId: string, expiresAt: Date): Promise<RefreshToken> {
    const rows = await query<RefreshToken>(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, tokenHash, familyId, expiresAt]
    );
    return rows[0];
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return queryOne<RefreshToken>(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1',
      [tokenHash]
    );
  }

  async markRevoked(id: string): Promise<void> {
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [id]);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
      [familyId]
    );
  }

  async revokeAllByUser(userId: string): Promise<void> {
    await query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
  }

  async deleteExpired(): Promise<number> {
    const rows = await query<{ count: string }>(
      `WITH deleted AS (
        DELETE FROM refresh_tokens WHERE expires_at < now() RETURNING 1
      ) SELECT count(*) FROM deleted`
    );
    return parseInt(rows[0].count, 10);
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
