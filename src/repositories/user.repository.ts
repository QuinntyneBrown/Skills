import { query, queryOne, withTransaction } from '../config/database';
import { User, UserWithRoles } from '../models/user';

export class UserRepository {
  async createUser(
    email: string,
    passwordHash: string | null,
    emailToken: string | null,
    emailTokenExpiry: Date | null,
    emailVerified: boolean = false
  ): Promise<User> {
    const rows = await query<User>(
      `INSERT INTO users (email, password_hash, email_verification_token, email_verification_expires_at, email_verified)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [email, passwordHash, emailToken, emailTokenExpiry, emailVerified]
    );
    return rows[0];
  }

  async findByEmail(email: string): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE email = $1', [email]);
  }

  async findById(id: string): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
  }

  async findByIdWithRoles(id: string): Promise<UserWithRoles | null> {
    const user = await this.findById(id);
    if (!user) return null;
    const roles = await this.getUserRoles(id);
    return { ...user, roles };
  }

  async findByEmailWithRoles(email: string): Promise<UserWithRoles | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;
    const roles = await this.getUserRoles(user.id);
    return { ...user, roles };
  }

  async updateEmailVerified(userId: string): Promise<void> {
    await query(
      `UPDATE users SET email_verified = true, email_verification_token = NULL, email_verification_expires_at = NULL WHERE id = $1`,
      [userId]
    );
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
  }

  async updateLockout(userId: string, lockedUntil: Date | null, failedAttempts: number): Promise<void> {
    await query(
      'UPDATE users SET locked_until = $1, failed_login_attempts = $2 WHERE id = $3',
      [lockedUntil, failedAttempts, userId]
    );
  }

  async incrementFailedAttempts(userId: string): Promise<number> {
    const rows = await query<{ failed_login_attempts: number }>(
      `UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1
       RETURNING failed_login_attempts`,
      [userId]
    );
    return rows[0].failed_login_attempts;
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    await query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [userId]);
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const rows = await query<{ name: string }>(
      `SELECT r.name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [userId]
    );
    return rows.map((r) => r.name);
  }

  async assignRole(userId: string, roleName: string): Promise<void> {
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE name = $2
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roleName]
    );
  }

  async removeRole(userId: string, roleName: string): Promise<void> {
    await query(
      `DELETE FROM user_roles WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE name = $2)`,
      [userId, roleName]
    );
  }
}

export const userRepository = new UserRepository();
