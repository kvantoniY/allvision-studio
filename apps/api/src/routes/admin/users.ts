import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';

export const adminUsersRouter = Router();

adminUsersRouter.use(requireAuth, requireAdmin);

// Роли, назначаемые из админки. Academy-роли обязательны: без TEACHER/METHODIST
// платформу не запустить (некому вести уроки и вести программу).
const ACADEMY_ASSIGNABLE_ROLES = [
  'USER',
  'PARENT',
  'TEACHER',
  'METHODIST',
  'ADMIN',
  'READONLY_ADMIN',
] as const;

const usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  role: z.enum(ACADEMY_ASSIGNABLE_ROLES).optional(),
  status: z.enum(['active', 'deleted']).optional(),
  search: z.string().trim().min(1).optional(),
});

const updateUserSchema = z
  .object({
    tokenBalance: z.coerce.number().int().min(0).optional(),
    tokenBalanceDelta: z.coerce.number().int().optional(),
    role: z.enum(ACADEMY_ASSIGNABLE_ROLES).optional(),
    reason: z.string().trim().min(1).max(200).optional(),
  })
  .refine(
    (data) => data.tokenBalance !== undefined || data.tokenBalanceDelta !== undefined || data.role !== undefined,
    { message: 'Укажите tokenBalance, tokenBalanceDelta или role' },
  );

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

    const [completedCount, failedCount, spendAgg, paymentsAgg, providerAgg] = await prisma.$transaction([
      prisma.project.count({ where: { userId: user.id, status: 'COMPLETED' } }),
      prisma.project.count({ where: { userId: user.id, status: 'FAILED' } }),
      prisma.project.aggregate({ where: { userId: user.id, status: 'COMPLETED' }, _sum: { tokensCost: true } }),
      prisma.payment.aggregate({
        where: { userId: user.id, status: 'SUCCEEDED', purpose: 'TOPUP' },
        _sum: { amountRub: true, tokensAdded: true },
        _count: true,
      }),
      prisma.aIUsageLog.aggregate({ where: { userId: user.id }, _sum: { costUsd: true } }),
    ]);

    const stats = {
      totalProjects: user._count.projects,
      completedProjects: completedCount,
      failedProjects: failedCount,
      spentCoins: spendAgg._sum.tokensCost ?? 0,
      topupCount: paymentsAgg._count,
      topupRub: (paymentsAgg._sum.amountRub ?? 0) / 100,
      topupCoins: paymentsAgg._sum.tokensAdded ?? 0,
      providerCostUsd: providerAgg._sum.costUsd ?? 0,
    };

    res.json({ user: { ...(await enrichUserListItem(user)), stats } });
  } catch (err) {
    next(err);
  }
});

adminUsersRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateUserSchema.parse(req.body);

    const current = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, tokenBalance: true, role: true, email: true },
    });
    if (!current) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');

    let nextBalance: number;
    if (body.tokenBalance !== undefined) {
      nextBalance = body.tokenBalance;
    } else if (body.tokenBalanceDelta !== undefined) {
      const candidate = current.tokenBalance + body.tokenBalanceDelta;
      if (candidate < 0) {
        throw new HttpError(400, 'BALANCE_NEGATIVE', `Итоговый баланс не может быть отрицательным (текущий ${current.tokenBalance}, попытка изменить на ${body.tokenBalanceDelta})`);
      }
      nextBalance = candidate;
    } else {
      nextBalance = current.tokenBalance;
    }

    const delta = nextBalance - current.tokenBalance;
    const nextRole = body.role ?? current.role;

    // Защита: нельзя снимать роль ADMIN с самого себя — иначе можно случайно потерять доступ.
    if (nextRole !== 'ADMIN' && current.id === req.user?.id && current.role === 'ADMIN') {
      throw new HttpError(400, 'CANNOT_DEMOTE_SELF', 'Нельзя снимать роль ADMIN с собственного аккаунта');
    }

    const reasonText = body.reason?.trim() || 'admin_adjust';

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: current.id },
        data: {
          ...(delta !== 0 ? { tokenBalance: nextBalance } : {}),
          ...(nextRole !== current.role ? { role: nextRole } : {}),
        },
        select: userListSelect,
      });

      if (delta !== 0) {
        await tx.tokenTransaction.create({
          data: {
            userId: current.id,
            amount: delta,
            reason: reasonText.slice(0, 64),
            refId: req.user?.id ?? null,
            balanceAfter: nextBalance,
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

// Ручная выдача занятий родителю (source=manual): нужна для тестовых прогонов и
// компенсаций без реальной оплаты через ЮKassa.
const grantLessonsSchema = z.object({
  durationMin: z.union([z.literal(25), z.literal(45)]),
  count: z.coerce.number().int().min(1).max(50),
});

adminUsersRouter.post('/:id/lesson-credits', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { durationMin, count } = grantLessonsSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');

    await prisma.lessonCredit.createMany({
      data: Array.from({ length: count }, () => ({
        parentId: user.id,
        durationMin,
        source: 'manual',
      })),
    });

    const balance = await prisma.lessonCredit.groupBy({
      by: ['durationMin'],
      where: { parentId: user.id, consumedAt: null },
      _count: { _all: true },
    });
    res.status(201).json({
      granted: count,
      durationMin,
      balance: balance.map((b) => ({ durationMin: b.durationMin, available: b._count._all })),
    });
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
