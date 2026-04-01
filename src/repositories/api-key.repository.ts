import { query, queryOne } from '../config/database';
import { ApiKey } from '../models/api-key';

export class ApiKeyRepository {
  async create(
    userId: string,
    name: string,
    keyPrefix: string,
    keyHash: string,
    scopes: string[],
    expiresAt: Date | null
  ): Promise<ApiKey> {
    const rows = await query<ApiKey>(
      `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, name, keyPrefix, keyHash, scopes, expiresAt]
    );
    return rows[0];
  }

  async findByHash(keyHash: string): Promise<ApiKey | null> {
    return queryOne<ApiKey>(
      'SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
      [keyHash]
    );
  }

  async findByUserId(userId: string): Promise<ApiKey[]> {
    return query<ApiKey>(
      'SELECT id, user_id, name, key_prefix, scopes, expires_at, last_used_at, created_at, revoked_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
  }

  async updateLastUsed(id: string): Promise<void> {
    await query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [id]);
  }

  async revoke(id: string): Promise<void> {
    await query('UPDATE api_keys SET revoked_at = now() WHERE id = $1', [id]);
  }
}

export const apiKeyRepository = new ApiKeyRepository();
