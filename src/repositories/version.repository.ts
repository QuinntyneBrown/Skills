import { query, queryOne } from '../config/database';
import { SkillVersion } from '../models/skill';
import { PaginationMeta } from '../models/dto';

export class VersionRepository {
  async findBySkillId(
    skillId: string,
    page: number = 1,
    limit: number = 25
  ): Promise<{ data: SkillVersion[]; pagination: PaginationMeta }> {
    const offset = (page - 1) * limit;

    const countResult = await query<{ count: string }>(
      'SELECT count(*) FROM skill_versions WHERE skill_id = $1',
      [skillId]
    );
    const totalCount = parseInt(countResult[0].count, 10);

    const data = await query<SkillVersion>(
      `SELECT * FROM skill_versions WHERE skill_id = $1
       ORDER BY version_number DESC
       LIMIT $2 OFFSET $3`,
      [skillId, limit, offset]
    );

    return {
      data,
      pagination: {
        page,
        page_size: limit,
        total_count: totalCount,
        total_pages: Math.ceil(totalCount / limit),
      },
    };
  }

  async findBySkillIdAndVersion(skillId: string, versionNumber: number): Promise<SkillVersion | null> {
    return queryOne<SkillVersion>(
      'SELECT * FROM skill_versions WHERE skill_id = $1 AND version_number = $2',
      [skillId, versionNumber]
    );
  }

  async findBySkillIdAndVersions(
    skillId: string,
    v1: number,
    v2: number
  ): Promise<{ version1: SkillVersion | null; version2: SkillVersion | null }> {
    const rows = await query<SkillVersion>(
      'SELECT * FROM skill_versions WHERE skill_id = $1 AND version_number IN ($2, $3)',
      [skillId, v1, v2]
    );
    return {
      version1: rows.find((r) => r.version_number === v1) ?? null,
      version2: rows.find((r) => r.version_number === v2) ?? null,
    };
  }

  async getLatestVersionNumber(skillId: string): Promise<number> {
    const result = await queryOne<{ max: number | null }>(
      'SELECT max(version_number) as max FROM skill_versions WHERE skill_id = $1',
      [skillId]
    );
    return result?.max ?? 0;
  }
}

export const versionRepository = new VersionRepository();
