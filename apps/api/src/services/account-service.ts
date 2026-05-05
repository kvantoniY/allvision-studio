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

const BCRYPT_COST = 12;

function toAccountUser(user: User): AccountUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    coinBalance: user.coinBalance,
    emailVerified: user.emailVerified,
    freeAvatarUsed: user.freeAvatarUsed,
    freeVoiceUsed: user.freeVoiceUsed,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function getDashboard(userId: string): Promise<DashboardResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');

  const [
    totalGenerations,
    completedGenerations,
    processingGenerations,
    spentAgg,
    recentGenerations,
    recentTransactions,
  ] = await Promise.all([
    prisma.generation.count({ where: { userId } }),
    prisma.generation.count({ where: { userId, status: 'COMPLETED' } }),
    prisma.generation.count({ where: { userId, status: { in: ['PENDING', 'PROCESSING'] } } }),
    prisma.coinTransaction.aggregate({
      _sum: { amount: true },
      where: { userId, amount: { lt: 0 } },
    }),
    prisma.generation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.coinTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    user: toAccountUser(user),
    stats: {
      totalGenerations,
      completedGenerations,
      processingGenerations,
      totalCoinsSpent: Math.abs(spentAgg._sum.amount ?? 0),
    },
    recentGenerations,
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
    prisma.coinTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.coinTransaction.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<AccountUser> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
    },
  });
  return toAccountUser(user);
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ accessToken: string; refreshToken: string; role: Role }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');

  const ok = await bcrypt.compare(oldPassword, user.password);
  if (!ok) {
    throw new HttpError(400, 'INVALID_OLD_PASSWORD', 'Current password is invalid');
  }

  const password = await bcrypt.hash(newPassword, BCRYPT_COST);
  await prisma.user.update({
    where: { id: userId },
    data: { password },
  });

  return {
    accessToken: signAccessToken(user.id, user.role),
    refreshToken: signRefreshToken(user.id),
    role: user.role,
  };
}

export async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    throw new HttpError(400, 'INVALID_PASSWORD', 'Password is invalid');
  }

  await prisma.user.delete({ where: { id: userId } });
}
