import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';

export const adminStylePresetsRouter = Router();

adminStylePresetsRouter.use(requireAuth, requireAdmin);

const kinds = ['user-avatar', 'user-location'] as const;

const listQuerySchema = z.object({
  kind: z.enum(kinds).optional(),
  isActive: z.preprocess((value) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }, z.boolean().optional()),
});

const createSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  kind: z.enum(kinds),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  promptText: z.string().trim().min(1).max(4000),
  thumbnail: z.string().trim().max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = createSchema.partial().omit({ slug: true });

function presetSelect() {
  return {
    id: true,
    slug: true,
    kind: true,
    title: true,
    description: true,
    promptText: true,
    thumbnail: true,
    sortOrder: true,
    isActive: true,
    createdAt: true,
  } as const;
}

adminStylePresetsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const where: Prisma.StylePresetWhereInput = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const items = await prisma.stylePreset.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { title: 'asc' }],
      select: presetSelect(),
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

adminStylePresetsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createSchema.parse(req.body);
    const preset = await prisma.stylePreset.create({
      data: {
        slug: body.slug,
        kind: body.kind,
        title: body.title,
        description: body.description,
        promptText: body.promptText,
        thumbnail: body.thumbnail ?? null,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
      },
      select: presetSelect(),
    });
    res.status(201).json({ preset });
  } catch (err) {
    next(err);
  }
});

adminStylePresetsRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateSchema.parse(req.body);
    const current = await prisma.stylePreset.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'STYLE_PRESET_NOT_FOUND', 'Шаблон не найден');
    const preset = await prisma.stylePreset.update({
      where: { id: current.id },
      data: {
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.promptText !== undefined ? { promptText: body.promptText } : {}),
        ...(body.thumbnail !== undefined ? { thumbnail: body.thumbnail } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      select: presetSelect(),
    });
    res.json({ preset });
  } catch (err) {
    next(err);
  }
});

adminStylePresetsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const current = await prisma.stylePreset.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'STYLE_PRESET_NOT_FOUND', 'Шаблон не найден');
    await prisma.stylePreset.delete({ where: { id: current.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
