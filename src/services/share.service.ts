import { skillShareRepository } from '../repositories/skill-share.repository';
import { skillRepository } from '../repositories/skill.repository';
import { userRepository } from '../repositories/user.repository';
import { roleService } from './role.service';
import { auditService } from './audit.service';
import { SkillShare } from '../models/skill';
import { NotFoundError, ValidationError } from '../utils/errors';

export class ShareService {
  async createShare(
    skillId: string,
    targetIdentifier: { userId?: string; email?: string },
    permission: 'read' | 'write',
    actingUserId: string,
    correlationId: string
  ): Promise<SkillShare> {
    const skill = await skillRepository.findById(skillId);
    if (!skill) throw new NotFoundError('Skill not found');

    await roleService.authorize(actingUserId, 'share', skill.owner_id, skillId);

    let targetUserId: string;
    if (targetIdentifier.userId) {
      targetUserId = targetIdentifier.userId;
    } else if (targetIdentifier.email) {
      const targetUser = await userRepository.findByEmail(targetIdentifier.email);
      if (!targetUser) throw new NotFoundError('User not found');
      targetUserId = targetUser.id;
    } else {
      throw new ValidationError('Either user_id or email must be provided');
    }

    if (targetUserId === skill.owner_id) {
      throw new ValidationError('Cannot share a skill with its owner');
    }

    const share = await skillShareRepository.create(skillId, targetUserId, permission);

    auditService.log('share', 'skill', skillId, actingUserId, correlationId, null, {
      shared_with: targetUserId,
      permission,
    });

    return share;
  }

  async revokeShare(
    skillId: string,
    targetUserId: string,
    actingUserId: string,
    correlationId: string
  ): Promise<void> {
    const skill = await skillRepository.findById(skillId);
    if (!skill) throw new NotFoundError('Skill not found');

    await roleService.authorize(actingUserId, 'share', skill.owner_id, skillId);

    const deleted = await skillShareRepository.delete(skillId, targetUserId);
    if (!deleted) throw new NotFoundError('Share not found');

    auditService.log('unshare', 'skill', skillId, actingUserId, correlationId, {
      shared_with: targetUserId,
    }, null);
  }

  async listShares(skillId: string, userId: string): Promise<SkillShare[]> {
    const skill = await skillRepository.findById(skillId);
    if (!skill) throw new NotFoundError('Skill not found');

    await roleService.authorize(userId, 'read', skill.owner_id, skillId);

    return skillShareRepository.findBySkillId(skillId);
  }
}

export const shareService = new ShareService();
