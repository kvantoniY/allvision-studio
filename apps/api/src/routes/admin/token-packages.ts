import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';

export const adminTokenPackagesRouter = Router();

adminTokenPackagesRouter.use(requireAuth, requireAdmin);

const featureSchema = z.string().trim().min(1).max(180);

const tokenPackageSchema = z.object({
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(160).nullable().optional(),
  tokens: z.coerce.number().int().min(1).max(1_000_000),
  priceRub: z.coerce.number().int().min(1).max(10_000_000),
  originalPriceRub: z.coerce.number().int().min(1).max(10_000_000).nullable().optional(),
  bonus: z.coerce.number().int().min(0).max(1_000_000).optional(),
  badgeText: z.string().trim().max(80).nullable().optional(),
  features: z.array(featureSchema).max(8).optional(),
  isPopular: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100_000).optional(),
});

const createTokenPackageSchema = tokenPackageSchema;
const updateTokenPackageSchema = tokenPackageSchema.partial();

function tokenPackageSelect() {
  return {
    id: true,
    title: true,
    subtitle: true,
    tokens: true,
    priceRub: true,
    originalPriceRub: true,
    bonus: true,
    badgeText: true,
    features: true,
    isPopular: true,
    isActive: true,
    sortOrder: true,
  } as const;
}

adminTokenPackagesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.tokenPackage.findMany({
      orderBy: [{ sortOrder: 'asc' }, { priceRub: 'asc' }],
      select: tokenPackageSelect(),
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

adminTokenPackagesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createTokenPackageSchema.parse(req.body);
    const item = await prisma.tokenPackage.create({
      data: {
        title: body.title,
        subtitle: body.subtitle ?? null,
        tokens: body.tokens,
        priceRub: body.priceRub,
        originalPriceRub: body.originalPriceRub ?? null,
        bonus: body.bonus ?? 0,
        badgeText: body.badgeText ?? null,
        features: body.features ?? [],
        isPopular: body.isPopular ?? false,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
      select: tokenPackageSelect(),
    });
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

adminTokenPackagesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateTokenPackageSchema.parse(req.body);
    const current = await prisma.tokenPackage.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!current) throw new HttpError(404, 'TOKEN_PACKAGE_NOT_FOUND', 'Пакет токенов не найден');

    const item = await prisma.tokenPackage.update({
      where: { id: current.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.subtitle !== undefined ? { subtitle: body.subtitle } : {}),
        ...(body.tokens !== undefined ? { tokens: body.tokens } : {}),
        ...(body.priceRub !== undefined ? { priceRub: body.priceRub } : {}),
        ...(body.originalPriceRub !== undefined ? { originalPriceRub: body.originalPriceRub } : {}),
        ...(body.bonus !== undefined ? { bonus: body.bonus } : {}),
        ...(body.badgeText !== undefined ? { badgeText: body.badgeText } : {}),
        ...(body.features !== undefined ? { features: body.features } : {}),
        ...(body.isPopular !== undefined ? { isPopular: body.isPopular } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
      select: tokenPackageSelect(),
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

adminTokenPackagesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const current = await prisma.tokenPackage.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!current) throw new HttpError(404, 'TOKEN_PACKAGE_NOT_FOUND', 'Пакет токенов не найден');
    await prisma.tokenPackage.delete({ where: { id: current.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
