import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
