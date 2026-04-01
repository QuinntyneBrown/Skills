import { query } from '../config/database';
import { AuditLog } from '../models/audit';
import { PaginationMeta } from '../models/dto';

export class AuditRepository {
  async insert(entry: {
    action: string;
    resourceType: string;
    resourceId: string;
    userId: string;
    correlationId: string;
    beforeState?: Record<string, any> | null;
    afterState?: Record<string, any> | null;
    metadata?: Record<string, any> | null;
  }): Promise<void> {
    await query(
      `INSERT INTO audit_logs (action, resource_type, resource_id, user_id, correlation_id, before_state, after_state, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.action,
        entry.resourceType,
        entry.resourceId,
        entry.userId,
        entry.correlationId,
        entry.beforeState ? JSON.stringify(entry.beforeState) : null,
        entry.afterState ? JSON.stringify(entry.afterState) : null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    );
  }

  async findAll(filters: {
    userId?: string;
    resourceType?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: AuditLog[]; pagination: PaginationMeta }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${paramIdx++}`);
      params.push(filters.userId);
    }
    if (filters.resourceType) {
      conditions.push(`resource_type = $${paramIdx++}`);
      params.push(filters.resourceType);
    }
    if (filters.action) {
      conditions.push(`action = $${paramIdx++}`);
      params.push(filters.action);
    }
    if (filters.from) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(filters.from);
    }
    if (filters.to) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(filters.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize || 25));
    const offset = (page - 1) * pageSize;

    const countResult = await query<{ count: string }>(
      `SELECT count(*) FROM audit_logs ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult[0].count, 10);

    const data = await query<AuditLog>(
      `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, pageSize, offset]
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
}

export const auditRepository = new AuditRepository();
