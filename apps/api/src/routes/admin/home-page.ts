import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';

export const adminHomePageRouter = Router();

adminHomePageRouter.use(requireAuth, requireAdmin);

const HOME_PAGE_CONTENT_KEY = 'home_page_content_v1';
const MAX_CONTENT_BYTES = 250_000;

const contentSchema = z.object({
  content: z.record(z.string(), z.unknown()),
});

function parseContent(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

adminHomePageRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await prisma.setting.findUnique({ where: { key: HOME_PAGE_CONTENT_KEY } });
    res.json({ content: parseContent(row?.value) });
  } catch (err) {
    next(err);
  }
});

adminHomePageRouter.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = contentSchema.parse(req.body);
    const serialized = JSON.stringify(body.content);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_CONTENT_BYTES) {
      throw new HttpError(413, 'HOME_PAGE_CONTENT_TOO_LARGE', 'Контент главной страницы слишком большой');
    }

    await prisma.setting.upsert({
      where: { key: HOME_PAGE_CONTENT_KEY },
      update: { value: serialized },
      create: { key: HOME_PAGE_CONTENT_KEY, value: serialized },
    });

    res.json({ content: body.content });
  } catch (err) {
    next(err);
  }
});
