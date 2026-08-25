import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@allvision/database';
import { WAITLIST_TOPICS } from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';

export const adminWaitlistRouter = Router();

adminWaitlistRouter.use(requireAuth, requireAdmin);

const listQuerySchema = z.object({
  topic: z.enum(WAITLIST_TOPICS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

adminWaitlistRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const where = query.topic ? { topic: query.topic } : {};
    const [items, total] = await prisma.$transaction([
      prisma.waitlistLead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.waitlistLead.count({ where }),
    ]);
    res.json({ items, total, page: query.page, limit: query.limit });
  } catch (err) {
    next(err);
  }
});

adminWaitlistRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.waitlistLead.deleteMany({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
