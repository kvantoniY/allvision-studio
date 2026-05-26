import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireCaptcha } from '../middleware/captcha';
import { uploadSupportAttachments } from '../middleware/upload';
import * as support from '../services/support-service';

export const supportRouter = Router();

supportRouter.use(requireAuth);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['OPEN', 'RESOLVED']).optional(),
});

supportRouter.get('/tickets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    res.json(await support.listUserTickets(req.user!.id, query));
  } catch (err) {
    next(err);
  }
});

supportRouter.post('/tickets', requireCaptcha(), uploadSupportAttachments, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await support.createTicket(req.user!.id, {
      subject: req.body?.subject,
      body: req.body?.body,
      files: req.files,
    });
    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
});

supportRouter.get('/tickets/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await support.getUserTicket(req.user!.id, req.params.id);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

supportRouter.post('/tickets/:id/messages', requireCaptcha(), uploadSupportAttachments, async (req: Request, res: Response, next: NextFunction) => {
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

supportRouter.post('/tickets/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticket = await support.resolveTicket({ id: req.user!.id, role: req.user!.role }, req.params.id);
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});
