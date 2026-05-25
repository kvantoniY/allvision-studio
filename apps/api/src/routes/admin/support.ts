import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { uploadSupportAttachments } from '../../middleware/upload';
import * as support from '../../services/support-service';

export const adminSupportRouter = Router();

adminSupportRouter.use(requireAuth, requireAdmin);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(['OPEN', 'RESOLVED']).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

adminSupportRouter.get('/tickets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    res.json(await support.listAdminTickets(query));
  } catch (err) {
    next(err);
  }
});

adminSupportRouter.get('/tickets/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await support.getAdminTicket(req.params.id);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

adminSupportRouter.post('/tickets/:id/messages', uploadSupportAttachments, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await support.addMessage(
      { id: req.user!.id, role: req.user!.role },
      req.params.id,
      { body: req.body?.body, files: req.files },
    );
    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
});

adminSupportRouter.post('/tickets/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await support.resolveTicket({ id: req.user!.id, role: req.user!.role }, req.params.id);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});
