import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAuth, requireAdmin);

const usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  role: z.enum(['USER', 'ADMIN', 'READONLY_ADMIN']).optional(),
  status: z.enum(['active', 'deleted']).optional(),
  search: z.string().trim().min(1).optional(),
});

const updateUserSchema = z.object({
  tokenBalance: z.coerce.number().int().min(0).optional(),
});

adminUsersRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = usersQuerySchema.parse(req.query);
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status === 'active' ? { deletedAt: null } : {}),
      ...(query.status === 'deleted' ? { deletedAt: { not: null } } : {}),
      ...(query.search ? { email: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: userListSelect,
      }),
      prisma.user.count({ where }),
    ]);

    const items = await Promise.all(users.map(enrichUserListItem));
    res.json({ items, total, page: query.page, limit: query.limit });
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        ...userListSelect,
        messenger: true,
        messengerType: true,
        freeCharacterUsed: true,
        projects: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, title: true, status: true, progress: true, tokensCost: true, createdAt: true, service: { select: { id: true, slug: true, title: true } } },
        },
        tokenTxns: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, amount: true, reason: true, refId: true, balanceAfter: true, createdAt: true },
        },
      },
    });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
    res.json({ user: await enrichUserListItem(user) });
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateUserSchema.parse(req.body);
    if (body.tokenBalance === undefined) throw new HttpError(400, 'BALANCE_REQUIRED', 'Укажите новый баланс коинов');

    const current = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, tokenBalance: true } });
    if (!current) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
    const delta = body.tokenBalance - current.tokenBalance;
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: current.id },
        data: { tokenBalance: body.tokenBalance },
        select: userListSelect,
      });
      if (delta !== 0) {
        await tx.tokenTransaction.create({
          data: {
            userId: current.id,
            amount: delta,
            reason: 'ADMIN_BALANCE_ADJUSTMENT',
            refId: req.user?.id,
            balanceAfter: body.tokenBalance!,
          },
        });
      }
      return updated;
    });
    res.json({ user: await enrichUserListItem(user) });
  } catch (err) {
    next(err);
  }
});

const userListSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  tokenBalance: true,
  deletedAt: true,
  createdAt: true,
  _count: { select: { projects: true } },
} satisfies Prisma.UserSelect;

async function enrichUserListItem<T extends { id: string; createdAt: Date }>(user: T) {
  const lastProject = await prisma.project.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, completedAt: true },
  });
  return {
    ...user,
    lastActivityAt: lastProject?.completedAt ?? lastProject?.createdAt ?? user.createdAt,
  };
}
