import { Router, type NextFunction, type Request, type Response } from 'express';
import { BLOCK_CATALOG } from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';

export const adminBlocksRouter = Router();

adminBlocksRouter.use(requireAuth, requireAdmin);

adminBlocksRouter.get('/', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ blocks: BLOCK_CATALOG });
  } catch (err) {
    next(err);
  }
});
