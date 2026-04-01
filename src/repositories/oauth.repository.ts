import { query, queryOne } from '../config/database';
import { OAuthAccount } from '../models/user';

export class OAuthRepository {
  async create(
    userId: string,
    provider: string,
    providerUserId: string,
    accessToken: string | null
  ): Promise<OAuthAccount> {
    const rows = await query<OAuthAccount>(
      `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, access_token)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, provider, providerUserId, accessToken]
    );
    return rows[0];
  }

  async findByProviderAndUserId(provider: string, providerUserId: string): Promise<OAuthAccount | null> {
    return queryOne<OAuthAccount>(
      'SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
      [provider, providerUserId]
    );
  }

  async updateAccessToken(id: string, accessToken: string): Promise<void> {
    await query('UPDATE oauth_accounts SET access_token = $1 WHERE id = $2', [accessToken, id]);
  }
}

export const oauthRepository = new OAuthRepository();
