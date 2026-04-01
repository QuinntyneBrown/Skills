import { Router, Request, Response, NextFunction } from 'express';
import { healthCheckService } from '../services/health.service';
import { metricsRegistry } from '../services/metrics.service';
import { auditRepository } from '../repositories/audit.repository';
import { roleService } from '../services/role.service';
import { validate } from '../middleware/validation';
import { auditQuerySchema } from './validation-schemas';
import { ForbiddenError } from '../utils/errors';

const router = Router();

// Health check (public)
router.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await healthCheckService.checkHealth();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    next(err);
  }
});

// Metrics (restricted)
router.get('/metrics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    const metrics = await metricsRegistry.metrics();
    res.end(metrics);
  } catch (err) {
    next(err);
  }
});

export const healthRouter = router;

// Audit logs router (admin only, under /api/v1)
const auditRouter = Router();

auditRouter.get('/', validate(auditQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isAdmin = await roleService.hasRole(req.userId!, 'admin');
    if (!isAdmin) throw new ForbiddenError('Admin access required');

    const result = await auditRepository.findAll({
      userId: req.query.user_id as string,
      resourceType: req.query.resource_type as string,
      action: req.query.action as string,
      from: req.query.from as string,
      to: req.query.to as string,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.page_size ? Number(req.query.page_size) : undefined,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export { auditRouter };
