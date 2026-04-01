import { auditRepository } from '../repositories/audit.repository';
import { logger } from '../utils/logger';

export class AuditService {
  log(
    action: string,
    resourceType: string,
    resourceId: string,
    userId: string,
    correlationId: string,
    beforeState?: Record<string, any> | null,
    afterState?: Record<string, any> | null,
    metadata?: Record<string, any> | null
  ): void {
    // Fire-and-forget: don't block the primary request
    auditRepository
      .insert({
        action,
        resourceType,
        resourceId,
        userId,
        correlationId,
        beforeState,
        afterState,
        metadata,
      })
      .catch((err) => {
        logger.error('Failed to write audit log', {
          error: err.message,
          action,
          resourceType,
          resourceId,
          userId,
        });
      });
  }
}

export const auditService = new AuditService();
