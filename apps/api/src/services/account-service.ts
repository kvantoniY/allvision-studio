import bcrypt from 'bcrypt';
import { prisma } from '@allvision/database';
import type { Role, User } from '@allvision/database';
import type {
  AccountUser,
  DashboardResponse,
  Paginated,
  UpdateProfileInput,
} from '@allvision/shared';
import { HttpError } from '../utils/http-error';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { expirePendingPayments, reconcilePaymentList } from './payment-service';

const BCRYPT_COST = 12;

const ACTIVE_ORDER_STATUSES = [
  'NEW',
  'NEGOTIATING',
  'PRICE_SET',
  'PAID',
  'IN_PROGRESS',
  'REVIEW',
] as const;

function toAccountUser(user: User): AccountUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    tokenBalance: user.tokenBalance,
    role: user.role,
    messenger: user.messenger,
    messengerType: user.messengerType,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

export async function getDashboard(userId: string): Promise<DashboardResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');

  const [
    totalProjects,
    completedProjects,
    activeOrdersCount,
    spentAgg,
    recentProjects,
    activeOrders,
    recentTransactions,
  ] = await Promise.all([
    prisma.project.count({ where: { userId } }),
    prisma.project.count({ where: { userId, status: 'COMPLETED' } }),
    prisma.order.count({
      where: { userId, status: { in: ACTIVE_ORDER_STATUSES as unknown as any } },
    }),
    prisma.tokenTransaction.aggregate({
      _sum: { amount: true },
      where: { userId, amount: { lt: 0 } },
    }),
    prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 4,
    }),
    prisma.order.findMany({
      where: { userId, status: { in: ACTIVE_ORDER_STATUSES as unknown as any } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tokenTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const totalSpent = Math.abs(spentAgg._sum.amount ?? 0);

  return {
    user: toAccountUser(user),
    stats: {
      totalProjects,
      completedProjects,
      activeOrders: activeOrdersCount,
      totalSpent,
    },
    recentProjects,
    activeOrders,
    recentTransactions,
  };
}

export async function listTransactions(
  userId: string,
  params: { page: number; limit: number; type: 'topup' | 'spending' | 'all' },
): Promise<Paginated<any>> {
  const { page, limit, type } = params;
  const where: any = { userId };
  if (type === 'topup') where.amount = { gt: 0 };
  if (type === 'spending') where.amount = { lt: 0 };

  const [items, total] = await Promise.all([
    prisma.tokenTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.tokenTransaction.count({ where }),
  ]);

  return { items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function listPayments(
  userId: string,
  params: { page: number; limit: number },
): Promise<Paginated<any>> {
  const { page, limit } = params;
  await expirePendingPayments();
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payment.count({ where: { userId } }),
  ]);
  return { items: await reconcilePaymentList(items), total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<AccountUser> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.avatar !== undefined) data.avatar = input.avatar;
  if (input.messenger !== undefined) data.messenger = input.messenger;
  if (input.messengerType !== undefined) data.messengerType = input.messengerType;

  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });
  return toAccountUser(user);
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ accessToken: string; refreshToken: string; role: Role }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');

  const ok = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!ok) {
    throw new HttpError(400, 'INVALID_OLD_PASSWORD', 'Текущий пароль неверный');
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordResetToken: null, passwordResetExpiresAt: null },
  });

  return {
    accessToken: signAccessToken(user.id, user.role),
    refreshToken: signRefreshToken(user.id),
    role: user.role,
  };
}

export async function deleteAccount(userId: string, password: string): Promise<{ avatar: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new HttpError(400, 'INVALID_PASSWORD', 'Пароль неверный');
  }

  // Фактическую очистку/обезличивание выполняет A10 deletion-service после проверки пароля.
  return { avatar: user.avatar };
}
