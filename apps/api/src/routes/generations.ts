import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { generationCreateLimiter } from '../middleware/rate-limit';

export const generationsRouter = Router();

generationsRouter.use(requireAuth);

function notImplemented(_req: Request, res: Response) {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED_R6',
      message: 'Generation API will be implemented in R6+.',
    },
  });
}

generationsRouter.post('/', generationCreateLimiter, notImplemented);
generationsRouter.get('/', notImplemented);
generationsRouter.get('/:id', notImplemented);
generationsRouter.get('/:id/status', notImplemented);
generationsRouter.post('/:id/regenerate', generationCreateLimiter, notImplemented);
generationsRouter.delete('/:id', notImplemented);
