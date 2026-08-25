import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '@allvision/database';
import {
  adminCategoryCreateSchema,
  adminCategoryReorderSchema,
  adminCategoryUpdateSchema,
} from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';

export const adminServiceCategoriesRouter = Router();

adminServiceCategoriesRouter.use(requireAuth, requireAdmin);

function categorySelect() {
  return {
    code: true,
    section: true,
    title: true,
    description: true,
    shortDescription: true,
    iconName: true,
    sortOrder: true,
    isActive: true,
    isFeatured: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

adminServiceCategoriesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.serviceCategoryDef.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: categorySelect(),
    });
    const usage = await prisma.service.groupBy({
      by: ['category'],
      _count: { _all: true },
    });
    const usageMap = new Map(usage.map((row) => [row.category, row._count._all]));
    res.json({
      items: items.map((item) => ({ ...item, servicesCount: usageMap.get(item.code) ?? 0 })),
    });
  } catch (err) {
    next(err);
  }
});

adminServiceCategoriesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = adminCategoryCreateSchema.parse(req.body);
    const exists = await prisma.serviceCategoryDef.findUnique({ where: { code: body.code } });
    if (exists) throw new HttpError(409, 'CATEGORY_CODE_TAKEN', 'Код категории уже занят');
    const category = await prisma.serviceCategoryDef.create({
      data: {
        code: body.code,
        section: body.section ?? 'services',
        title: body.title,
        description: body.description ?? null,
        shortDescription: body.shortDescription ?? null,
        iconName: body.iconName ?? null,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
        isFeatured: body.isFeatured ?? false,
      },
      select: categorySelect(),
    });
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

adminServiceCategoriesRouter.patch('/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = adminCategoryUpdateSchema.parse(req.body);
    const current = await prisma.serviceCategoryDef.findUnique({ where: { code: req.params.code } });
    if (!current) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Категория не найдена');
    const category = await prisma.serviceCategoryDef.update({
      where: { code: current.code },
      data: {
        ...(body.section !== undefined ? { section: body.section } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.shortDescription !== undefined ? { shortDescription: body.shortDescription ?? null } : {}),
        ...(body.iconName !== undefined ? { iconName: body.iconName ?? null } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.isFeatured !== undefined ? { isFeatured: body.isFeatured } : {}),
      },
      select: categorySelect(),
    });
    res.json({ category });
  } catch (err) {
    next(err);
  }
});

adminServiceCategoriesRouter.delete('/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const current = await prisma.serviceCategoryDef.findUnique({ where: { code: req.params.code } });
    if (!current) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Категория не найдена');
    const inUse = await prisma.service.count({ where: { category: current.code } });
    if (inUse > 0) {
      throw new HttpError(409, 'CATEGORY_IN_USE', `Категория используется в ${inUse} услугах, удалить нельзя`);
    }
    await prisma.serviceCategoryDef.delete({ where: { code: current.code } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

adminServiceCategoriesRouter.post('/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = adminCategoryReorderSchema.parse(req.body);
    await prisma.$transaction(
      body.orderedCodes.map((code, index) =>
        prisma.serviceCategoryDef.update({ where: { code }, data: { sortOrder: index + 1 } }),
      ),
    );
    const items = await prisma.serviceCategoryDef.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: categorySelect(),
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});
