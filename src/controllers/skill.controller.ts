import { Router, Request, Response, NextFunction } from 'express';
import { skillService } from '../services/skill.service';
import { shareService } from '../services/share.service';
import { validate } from '../middleware/validation';
import {
  createSkillSchema,
  updateSkillSchema,
  skillIdParam,
  listSkillsSchema,
  shareSkillSchema,
  revokeShareSchema,
} from './validation-schemas';

function p(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const router = Router();

// Create skill
router.post('/', validate(createSkillSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skill = await skillService.createSkill(req.body, req.userId!, req.correlationId);
    res.status(201).json({ data: skill });
  } catch (err) {
    next(err);
  }
});

// List skills (with search & filters)
router.get('/', validate(listSkillsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queryParams = {
      ...req.query,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      page_size: req.query.page_size ? Number(req.query.page_size) : undefined,
    };

    const result = await skillService.listSkills(queryParams as any, req.userId!, req.userRoles || []);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// Get single skill
router.get('/:id', validate(skillIdParam), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skill = await skillService.getSkill(p(req.params.id), req.userId!);
    res.status(200).json({ data: skill });
  } catch (err) {
    next(err);
  }
});

// Update skill
router.patch('/:id', validate(updateSkillSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skill = await skillService.updateSkill(p(req.params.id), req.body, req.userId!, req.correlationId);
    res.status(200).json({ data: skill });
  } catch (err) {
    next(err);
  }
});

// Delete skill
router.delete('/:id', validate(skillIdParam), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await skillService.deleteSkill(p(req.params.id), req.userId!, req.correlationId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Restore skill (admin)
router.post('/:id/restore', validate(skillIdParam), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skill = await skillService.restoreSkill(p(req.params.id), req.userId!, req.correlationId);
    res.status(200).json({ data: skill });
  } catch (err) {
    next(err);
  }
});

// Share skill
router.post('/:id/shares', validate(shareSkillSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const share = await shareService.createShare(
      p(req.params.id),
      { userId: req.body.user_id, email: req.body.email },
      req.body.permission,
      req.userId!,
      req.correlationId
    );
    res.status(201).json({ data: share });
  } catch (err) {
    next(err);
  }
});

// List shares
router.get('/:id/shares', validate(skillIdParam), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shares = await shareService.listShares(p(req.params.id), req.userId!);
    res.status(200).json({ data: shares });
  } catch (err) {
    next(err);
  }
});

// Revoke share
router.delete('/:id/shares/:userId', validate(revokeShareSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await shareService.revokeShare(p(req.params.id), p(req.params.userId), req.userId!, req.correlationId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export const skillRouter = router;
