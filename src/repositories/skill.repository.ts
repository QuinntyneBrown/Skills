import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../config/database';
import { Skill } from '../models/skill';
import { PaginationMeta } from '../models/dto';

export interface SkillFilters {
  ownerId?: string;
  userId?: string;
  userRoles?: string[];
  q?: string;
  tags?: string[];
  author?: string;
  visibility?: string;
  createdAfter?: string;
  createdBefore?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

interface SkillListResult {
  data: Skill[];
  pagination: PaginationMeta;
}

const ALLOWED_SORT_FIELDS: Record<string, string> = {
  name: 'name',
  created_at: 'created_at',
  updated_at: 'updated_at',
  relevance: 'relevance',
};

export class SkillRepository {
  async insert(skill: {
    ownerId: string;
    name: string;
    description?: string;
    body: string;
    visibility?: string;
    tags?: string[];
    createdBy: string;
  }): Promise<Skill> {
    return withTransaction(async (client: PoolClient) => {
      const rows = await client.query<Skill>(
        `INSERT INTO skills (owner_id, name, description, body, visibility, tags, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          skill.ownerId,
          skill.name,
          skill.description || null,
          skill.body,
          skill.visibility || 'private',
          skill.tags || [],
          skill.createdBy,
        ]
      );
      const created = rows.rows[0];

      await client.query(
        `INSERT INTO skill_versions (skill_id, version_number, name, description, body, tags, changed_by)
         VALUES ($1, 1, $2, $3, $4, $5, $6)`,
        [created.id, created.name, created.description, created.body, JSON.stringify(created.tags), created.created_by]
      );

      return created;
    });
  }

  async findById(id: string): Promise<Skill | null> {
    return queryOne<Skill>(
      'SELECT * FROM skills WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
  }

  async findByIdIncludeDeleted(id: string): Promise<Skill | null> {
    return queryOne<Skill>('SELECT * FROM skills WHERE id = $1', [id]);
  }

  async findAll(filters: SkillFilters): Promise<SkillListResult> {
    const params: any[] = [];
    const conditions: string[] = ['s.deleted_at IS NULL'];
    let paramIdx = 1;

    // Auth filter: user can see their own, public, shared, or all if admin
    if (filters.userId && !filters.userRoles?.includes('admin')) {
      conditions.push(
        `(s.owner_id = $${paramIdx} OR s.visibility = 'public' OR EXISTS (
          SELECT 1 FROM skill_shares ss WHERE ss.skill_id = s.id AND ss.shared_with_user_id = $${paramIdx}
        ))`
      );
      params.push(filters.userId);
      paramIdx++;
    }

    // Full-text search
    let hasSearch = false;
    if (filters.q) {
      conditions.push(`s.search_vector @@ plainto_tsquery('english', $${paramIdx})`);
      params.push(filters.q);
      paramIdx++;
      hasSearch = true;
    }

    // Tag filter (AND logic)
    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`s.tags @> $${paramIdx}::text[]`);
      params.push(filters.tags);
      paramIdx++;
    }

    // Author filter
    if (filters.author) {
      conditions.push(`s.owner_id = $${paramIdx}`);
      params.push(filters.author);
      paramIdx++;
    }

    // Visibility filter
    if (filters.visibility) {
      conditions.push(`s.visibility = $${paramIdx}`);
      params.push(filters.visibility);
      paramIdx++;
    }

    // Date range filters
    if (filters.createdAfter) {
      conditions.push(`s.created_at >= $${paramIdx}`);
      params.push(filters.createdAfter);
      paramIdx++;
    }
    if (filters.createdBefore) {
      conditions.push(`s.created_at <= $${paramIdx}`);
      params.push(filters.createdBefore);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count
    const countResult = await query<{ count: string }>(
      `SELECT count(*) FROM skills s ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult[0].count, 10);

    // Sort
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize || 25));
    const order = filters.order === 'asc' ? 'ASC' : 'DESC';

    let orderClause: string;
    if (filters.sort === 'relevance' && hasSearch) {
      orderClause = `ORDER BY ts_rank(s.search_vector, plainto_tsquery('english', $${params.indexOf(filters.q!) + 1})) ${order}`;
    } else {
      const sortField = ALLOWED_SORT_FIELDS[filters.sort || 'updated_at'] || 'updated_at';
      orderClause = `ORDER BY s.${sortField} ${order}`;
    }

    const offset = (page - 1) * pageSize;

    // Select with search highlights if searching
    let selectClause = 's.*';
    if (hasSearch && filters.q) {
      const qParamIdx = params.indexOf(filters.q!) + 1;
      selectClause = `s.*, ts_headline('english', s.name, plainto_tsquery('english', $${qParamIdx}), 'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') as name_highlight, ts_headline('english', coalesce(s.description, ''), plainto_tsquery('english', $${qParamIdx}), 'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20') as description_highlight`;
    }

    const dataParams = [...params, pageSize, offset];
    const data = await query<Skill>(
      `SELECT ${selectClause} FROM skills s ${whereClause} ${orderClause} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      dataParams
    );

    return {
      data,
      pagination: {
        page,
        page_size: pageSize,
        total_count: totalCount,
        total_pages: Math.ceil(totalCount / pageSize),
      },
    };
  }

  async update(
    id: string,
    updates: Partial<Pick<Skill, 'name' | 'description' | 'body' | 'tags' | 'visibility'>>,
    expectedVersion: number,
    userId: string
  ): Promise<Skill | null> {
    return withTransaction(async (client: PoolClient) => {
      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (updates.name !== undefined) {
        setClauses.push(`name = $${paramIdx++}`);
        params.push(updates.name);
      }
      if (updates.description !== undefined) {
        setClauses.push(`description = $${paramIdx++}`);
        params.push(updates.description);
      }
      if (updates.body !== undefined) {
        setClauses.push(`body = $${paramIdx++}`);
        params.push(updates.body);
      }
      if (updates.tags !== undefined) {
        setClauses.push(`tags = $${paramIdx++}`);
        params.push(updates.tags);
      }
      if (updates.visibility !== undefined) {
        setClauses.push(`visibility = $${paramIdx++}`);
        params.push(updates.visibility);
      }

      if (setClauses.length === 0) return this.findById(id);

      setClauses.push(`version = version + 1`);

      const result = await client.query<Skill>(
        `UPDATE skills SET ${setClauses.join(', ')}
         WHERE id = $${paramIdx++} AND version = $${paramIdx++} AND deleted_at IS NULL
         RETURNING *`,
        [...params, id, expectedVersion]
      );

      if (result.rows.length === 0) return null;

      const updated = result.rows[0];

      // Create version snapshot
      await client.query(
        `INSERT INTO skill_versions (skill_id, version_number, name, description, body, tags, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          updated.id,
          updated.version,
          updated.name,
          updated.description,
          updated.body,
          JSON.stringify(updated.tags),
          userId,
        ]
      );

      return updated;
    });
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await query(
      'UPDATE skills SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return (result as any).length !== undefined;
  }

  async restore(id: string): Promise<Skill | null> {
    const rows = await query<Skill>(
      'UPDATE skills SET deleted_at = NULL WHERE id = $1 RETURNING *',
      [id]
    );
    return rows[0] ?? null;
  }
}

export const skillRepository = new SkillRepository();
