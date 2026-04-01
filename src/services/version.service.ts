import { versionRepository } from '../repositories/version.repository';
import { skillRepository } from '../repositories/skill.repository';
import { roleService } from './role.service';
import { auditService } from './audit.service';
import { cacheService } from './cache.service';
import { SkillVersion } from '../models/skill';
import { PaginatedResponse, DiffResult, VersionDiffResponse, DiffLine } from '../models/dto';
import { NotFoundError } from '../utils/errors';

export class VersionService {
  async listVersions(
    skillId: string,
    userId: string,
    page: number = 1,
    pageSize: number = 25
  ): Promise<PaginatedResponse<SkillVersion>> {
    const skill = await skillRepository.findById(skillId);
    if (!skill) throw new NotFoundError('Skill not found');

    await roleService.authorize(userId, 'read', skill.owner_id, skillId);

    return versionRepository.findBySkillId(skillId, page, pageSize);
  }

  async getVersion(skillId: string, versionNumber: number, userId: string): Promise<SkillVersion> {
    const skill = await skillRepository.findById(skillId);
    if (!skill) throw new NotFoundError('Skill not found');

    await roleService.authorize(userId, 'read', skill.owner_id, skillId);

    const version = await versionRepository.findBySkillIdAndVersion(skillId, versionNumber);
    if (!version) throw new NotFoundError('Version not found');

    return version;
  }

  async diffVersions(
    skillId: string,
    v1: number,
    v2: number,
    userId: string
  ): Promise<VersionDiffResponse> {
    const skill = await skillRepository.findById(skillId);
    if (!skill) throw new NotFoundError('Skill not found');

    await roleService.authorize(userId, 'read', skill.owner_id, skillId);

    const { version1, version2 } = await versionRepository.findBySkillIdAndVersions(skillId, v1, v2);
    if (!version1) throw new NotFoundError(`Version ${v1} not found`);
    if (!version2) throw new NotFoundError(`Version ${v2} not found`);

    const diffs: DiffResult[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    // Diff each field
    for (const field of ['name', 'description', 'body'] as const) {
      const oldVal = String(version1[field] ?? '');
      const newVal = String(version2[field] ?? '');
      if (oldVal !== newVal) {
        const changes = this.computeLineDiff(oldVal, newVal);
        const additions = changes.filter((c) => c.type === 'add').length;
        const deletions = changes.filter((c) => c.type === 'remove').length;
        totalAdditions += additions;
        totalDeletions += deletions;
        diffs.push({ field, changes });
      }
    }

    // Diff tags
    const oldTags = JSON.stringify(version1.tags);
    const newTags = JSON.stringify(version2.tags);
    if (oldTags !== newTags) {
      diffs.push({
        field: 'tags',
        changes: [
          { type: 'remove', content: oldTags },
          { type: 'add', content: newTags },
        ],
      });
      totalAdditions++;
      totalDeletions++;
    }

    return {
      diffs,
      stats: { additions: totalAdditions, deletions: totalDeletions },
    };
  }

  async restoreVersion(
    skillId: string,
    versionNumber: number,
    userId: string,
    correlationId: string
  ): Promise<any> {
    const skill = await skillRepository.findById(skillId);
    if (!skill) throw new NotFoundError('Skill not found');

    await roleService.authorize(userId, 'update', skill.owner_id, skillId);

    const version = await versionRepository.findBySkillIdAndVersion(skillId, versionNumber);
    if (!version) throw new NotFoundError('Version not found');

    // Update the skill with the old version's content, creating a new version
    const updated = await skillRepository.update(
      skillId,
      {
        name: version.name,
        description: version.description,
        body: version.body,
        tags: version.tags as string[],
      },
      skill.version,
      userId
    );

    if (!updated) {
      throw new NotFoundError('Failed to restore version due to concurrent modification');
    }

    await cacheService.invalidateSkill(skillId);

    auditService.log('restore_version', 'skill', skillId, userId, correlationId, {
      version: skill.version,
    }, {
      version: updated.version,
      restored_from: versionNumber,
    });

    return updated;
  }

  private computeLineDiff(oldText: string, newText: string): DiffLine[] {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const changes: DiffLine[] = [];

    // Simple LCS-based diff
    const lcs = this.lcs(oldLines, newLines);
    let oi = 0;
    let ni = 0;
    let li = 0;

    while (oi < oldLines.length || ni < newLines.length) {
      if (li < lcs.length && oi < oldLines.length && oldLines[oi] === lcs[li] && ni < newLines.length && newLines[ni] === lcs[li]) {
        changes.push({ type: 'unchanged', content: lcs[li], oldLineNumber: oi + 1, newLineNumber: ni + 1 });
        oi++;
        ni++;
        li++;
      } else if (oi < oldLines.length && (li >= lcs.length || oldLines[oi] !== lcs[li])) {
        changes.push({ type: 'remove', content: oldLines[oi], oldLineNumber: oi + 1 });
        oi++;
      } else if (ni < newLines.length && (li >= lcs.length || newLines[ni] !== lcs[li])) {
        changes.push({ type: 'add', content: newLines[ni], newLineNumber: ni + 1 });
        ni++;
      }
    }

    return changes;
  }

  private lcs(a: string[], b: string[]): string[] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    const result: string[] = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        result.unshift(a[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return result;
  }
}

export const versionService = new VersionService();
