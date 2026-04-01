import { userRepository } from '../repositories/user.repository';
import { skillRepository } from '../repositories/skill.repository';
import { skillShareRepository } from '../repositories/skill-share.repository';
import { ForbiddenError } from '../utils/errors';
import { cacheRepository } from '../repositories/cache.repository';

type Action = 'create' | 'read' | 'update' | 'delete' | 'share' | 'admin';

export class RoleService {
  async authorize(userId: string, action: Action, resourceOwnerId?: string, resourceId?: string): Promise<void> {
    const roles = await this.getUserRoles(userId);

    // Admin can do everything
    if (roles.includes('admin')) return;

    switch (action) {
      case 'admin':
        throw new ForbiddenError('Admin access required');

      case 'create':
        // Members can create, viewers cannot
        if (roles.includes('member')) return;
        throw new ForbiddenError('You do not have permission to create skills');

      case 'read':
        // All authenticated users can read (visibility checks happen in repository)
        return;

      case 'update':
      case 'delete':
      case 'share':
        if (!roles.includes('member')) {
          throw new ForbiddenError('You do not have permission to perform this action');
        }
        // Members can only modify their own skills (or shared with write access)
        if (resourceOwnerId && resourceOwnerId !== userId) {
          if (resourceId) {
            const share = await skillShareRepository.findBySkillAndUser(resourceId, userId);
            if (share && share.permission === 'write') return;
          }
          throw new ForbiddenError('You do not have permission to modify this skill');
        }
        return;

      default:
        throw new ForbiddenError('Unknown action');
    }
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const cached = await cacheRepository.get<string[]>(`roles:${userId}`);
    if (cached) return cached;

    const roles = await userRepository.getUserRoles(userId);
    await cacheRepository.set(`roles:${userId}`, roles, 300);
    return roles;
  }

  async hasRole(userId: string, role: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId);
    return roles.includes(role);
  }
}

export const roleService = new RoleService();
