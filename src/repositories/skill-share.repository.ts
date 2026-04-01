import { query, queryOne } from '../config/database';
import { SkillShare } from '../models/skill';

export class SkillShareRepository {
  async create(skillId: string, sharedWithUserId: string, permission: 'read' | 'write'): Promise<SkillShare> {
    const rows = await query<SkillShare>(
      `INSERT INTO skill_shares (skill_id, shared_with_user_id, permission)
       VALUES ($1, $2, $3)
       ON CONFLICT (skill_id, shared_with_user_id) DO UPDATE SET permission = $3
       RETURNING *`,
      [skillId, sharedWithUserId, permission]
    );
    return rows[0];
  }

  async findBySkillAndUser(skillId: string, userId: string): Promise<SkillShare | null> {
    return queryOne<SkillShare>(
      'SELECT * FROM skill_shares WHERE skill_id = $1 AND shared_with_user_id = $2',
      [skillId, userId]
    );
  }

  async findBySkillId(skillId: string): Promise<SkillShare[]> {
    return query<SkillShare>(
      'SELECT * FROM skill_shares WHERE skill_id = $1 ORDER BY created_at DESC',
      [skillId]
    );
  }

  async findByUserId(userId: string): Promise<SkillShare[]> {
    return query<SkillShare>(
      'SELECT * FROM skill_shares WHERE shared_with_user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
  }

  async delete(skillId: string, sharedWithUserId: string): Promise<boolean> {
    const rows = await query(
      'DELETE FROM skill_shares WHERE skill_id = $1 AND shared_with_user_id = $2 RETURNING id',
      [skillId, sharedWithUserId]
    );
    return rows.length > 0;
  }
}

export const skillShareRepository = new SkillShareRepository();
