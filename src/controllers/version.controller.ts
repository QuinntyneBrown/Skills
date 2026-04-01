import { Router, Request, Response, NextFunction } from 'express';
import { versionService } from '../services/version.service';
import { validate } from '../middleware/validation';
import {
  versionListSchema,
  versionGetSchema,
  versionDiffSchema,
  versionRestoreSchema,
} from './validation-schemas';

function p(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const router = Router();

// List versions
router.get('/:id/versions', validate(versionListSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.page_size ? Number(req.query.page_size) : 25;
    const result = await versionService.listVersions(p(req.params.id), req.userId!, page, pageSize);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// Get specific version
router.get('/:id/versions/:version', validate(versionGetSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const version = await versionService.getVersion(
      p(req.params.id),
      Number(p(req.params.version)),
      req.userId!
    );
    res.status(200).json({ data: version });
  } catch (err) {
    next(err);
  }
});

// Diff two versions
router.get('/:id/versions/:v1/diff/:v2', validate(versionDiffSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await versionService.diffVersions(
      p(req.params.id),
      Number(p(req.params.v1)),
      Number(p(req.params.v2)),
      req.userId!
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// Restore version
router.post('/:id/versions/:version/restore', validate(versionRestoreSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await versionService.restoreVersion(
      p(req.params.id),
      Number(p(req.params.version)),
      req.userId!,
      req.correlationId
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

export const versionRouter = router;
