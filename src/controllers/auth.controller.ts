import { Router, Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { auditService } from '../services/audit.service';
import { validate } from '../middleware/validation';
import { registerSchema, loginSchema, refreshSchema } from './validation-schemas';

const router = Router();

router.post('/register', validate(registerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.login(req.body);

    auditService.log('login', 'session', req.body.email, req.body.email, req.correlationId, null, null, {
      ip: req.ip,
      user_agent: req.headers['user-agent'],
    });

    res.status(200).json(result);
  } catch (err) {
    auditService.log('login_failed', 'session', req.body.email, req.body.email, req.correlationId, null, null, {
      ip: req.ip,
    });
    next(err);
  }
});

router.post('/refresh', validate(refreshSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    if (req.userId) {
      auditService.log('logout', 'session', req.userId, req.userId, req.correlationId);
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.logoutAll(req.userId!);

    auditService.log('logout_all', 'session', req.userId!, req.userId!, req.correlationId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.query as { token: string };
    await authService.verifyEmail(token);
    res.status(200).json({ message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { oldPassword, newPassword } = req.body;
    await authService.changePassword(req.userId!, oldPassword, newPassword);

    auditService.log('password_change', 'user', req.userId!, req.userId!, req.correlationId);

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

export const authRouter = router;
