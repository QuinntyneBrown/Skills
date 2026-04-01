import crypto from 'crypto';
import { skillRepository, SkillFilters } from '../repositories/skill.repository';
import { cacheService } from './cache.service';
import { auditService } from './audit.service';
import { roleService } from './role.service';
import { Skill } from '../models/skill';
import { CreateSkillDto, UpdateSkillDto, ListSkillsQuery, PaginatedResponse } from '../models/dto';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';

export class SkillService {
  async createSkill(dto: CreateSkillDto, userId: string, correlationId: string): Promise<Skill> {
    await roleService.authorize(userId, 'create');

    this.validateSkillInput(dto);

    let skill: Skill;
    try {
      skill = await skillRepository.insert({
        ownerId: userId,
        name: dto.name,
        description: dto.description,
        body: dto.body,
        visibility: dto.visibility,
        tags: dto.tags,
        createdBy: userId,
      });
    } catch (err: any) {
      // Handle unique constraint violation (PostgreSQL error code 23505)
      if (err.code === '23505') {
        // Soft-delete the existing skill with the same name and retry
        const existing = await skillRepository.findByOwnerAndName(userId, dto.name);
        if (existing) {
          await skillRepository.softDelete(existing.id);
          await cacheService.invalidateSkill(existing.id);
          skill = await skillRepository.insert({
            ownerId: userId,
            name: dto.name,
            description: dto.description,
            body: dto.body,
            visibility: dto.visibility,
            tags: dto.tags,
            createdBy: userId,
          });
        } else {
          throw new ConflictError(`A skill with the name "${dto.name}" already exists`);
        }
      } else {
        throw err;
      }
    }

    await cacheService.invalidateSkill(skill.id);

    auditService.log('create', 'skill', skill.id, userId, correlationId, null, {
      name: skill.name,
      visibility: skill.visibility,
    });

    return skill;
  }

  async getSkill(id: string, userId: string): Promise<Skill> {
    // Check cache first
    const cached = await cacheService.getSkill<Skill>(id);
    if (cached) {
      await roleService.authorize(userId, 'read', cached.owner_id, id);
      return cached;
    }

    const skill = await skillRepository.findById(id);
    if (!skill) throw new NotFoundError('Skill not found');

    await roleService.authorize(userId, 'read', skill.owner_id, id);

    await cacheService.setSkill(id, skill);
    return skill;
  }

  async listSkills(queryParams: ListSkillsQuery, userId: string, userRoles: string[]): Promise<PaginatedResponse<Skill>> {
    const queryHash = crypto
      .createHash('md5')
      .update(JSON.stringify({ ...queryParams, userId, userRoles }))
      .digest('hex');

    const cached = await cacheService.getList<PaginatedResponse<Skill>>(queryHash);
    if (cached) return cached;

    const filters: SkillFilters = {
      userId,
      userRoles,
      q: queryParams.q,
      tags: queryParams.tags,
      author: queryParams.author,
      visibility: queryParams.visibility,
      createdAfter: queryParams.created_after,
      createdBefore: queryParams.created_before,
      sort: queryParams.sort,
      order: queryParams.order,
      page: queryParams.page,
      pageSize: queryParams.page_size,
    };

    const result = await skillRepository.findAll(filters);

    await cacheService.setList(queryHash, result);
    return result;
  }

  async updateSkill(
    id: string,
    dto: UpdateSkillDto,
    userId: string,
    correlationId: string
  ): Promise<Skill> {
    const existing = await skillRepository.findById(id);
    if (!existing) throw new NotFoundError('Skill not found');

    await roleService.authorize(userId, 'update', existing.owner_id, id);

    if (dto.name !== undefined) {
      if (dto.name.length === 0) throw new ValidationError('Name must not be empty');
      if (dto.name.length > 200) throw new ValidationError('Name must not exceed 200 characters');
    }
    if (dto.body !== undefined && dto.body.length > 500000) {
      throw new ValidationError('Body must not exceed 500,000 characters');
    }

    const updated = await skillRepository.update(
      id,
      {
        name: dto.name,
        description: dto.description,
        body: dto.body,
        tags: dto.tags,
        visibility: dto.visibility,
      },
      dto.version,
      userId
    );

    if (!updated) {
      throw new ConflictError('Skill was modified by another user. Please refresh and try again.');
    }

    await cacheService.invalidateSkill(id);

    auditService.log('update', 'skill', id, userId, correlationId, {
      name: existing.name,
      version: existing.version,
    }, {
      name: updated.name,
      version: updated.version,
    });

    return updated;
  }

  async deleteSkill(id: string, userId: string, correlationId: string): Promise<void> {
    const existing = await skillRepository.findById(id);
    if (!existing) throw new NotFoundError('Skill not found');

    await roleService.authorize(userId, 'delete', existing.owner_id, id);

    await skillRepository.softDelete(id);
    await cacheService.invalidateSkill(id);

    auditService.log('delete', 'skill', id, userId, correlationId, {
      name: existing.name,
    }, null);
  }

  async restoreSkill(id: string, userId: string, correlationId: string): Promise<Skill> {
    await roleService.authorize(userId, 'admin');

    const existing = await skillRepository.findByIdIncludeDeleted(id);
    if (!existing) throw new NotFoundError('Skill not found');
    if (!existing.deleted_at) throw new ValidationError('Skill is not deleted');

    const restored = await skillRepository.restore(id);
    if (!restored) throw new NotFoundError('Failed to restore skill');

    await cacheService.invalidateSkill(id);

    auditService.log('restore', 'skill', id, userId, correlationId, null, {
      name: restored.name,
    });

    return restored;
  }

  private validateSkillInput(dto: CreateSkillDto): void {
    const details: Array<{ field: string; reason: string }> = [];

    if (!dto.name || dto.name.trim().length === 0) {
      details.push({ field: 'name', reason: 'Name is required' });
    } else if (dto.name.length > 200) {
      details.push({ field: 'name', reason: 'Name must not exceed 200 characters' });
    }

    if (!dto.body || dto.body.trim().length === 0) {
      details.push({ field: 'body', reason: 'Body is required' });
    } else if (dto.body.length > 500000) {
      details.push({ field: 'body', reason: 'Body must not exceed 500,000 characters' });
    }

    if (details.length > 0) {
      throw new ValidationError('Invalid skill data', details);
    }
  }
}

export const skillService = new SkillService();
