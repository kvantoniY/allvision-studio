import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '@allvision/database';
import type { Role, User } from '@allvision/database';
import type { RegisterInput, LoginInput } from '@allvision/shared';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

const BCRYPT_COST = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 час

export type SafeUser = Omit<User, 'passwordHash' | 'passwordResetToken' | 'passwordResetExpiresAt'>;

function toSafe(user: User): SafeUser {
  const { passwordHash: _p, passwordResetToken: _t, passwordResetExpiresAt: _e, ...rest } = user;
  return rest;
}

function makeTokens(userId: string, role: Role) {
  return {
    accessToken: signAccessToken(userId, role),
    refreshToken: signRefreshToken(userId),
  };
}

export async function register(data: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new HttpError(409, 'EMAIL_TAKEN', 'Пользователь с таким email уже существует');
  }

  const welcomeBonus = Number(process.env.WELCOME_TOKENS_BONUS ?? 50);
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        tokenBalance: welcomeBonus,
      },
    });

    if (welcomeBonus > 0) {
      await tx.tokenTransaction.create({
        data: {
          userId: created.id,
          amount: welcomeBonus,
          reason: 'welcome_bonus',
          balanceAfter: welcomeBonus,
        },
      });
    }

    return created;
  });

  const tokens = makeTokens(user.id, user.role);
  return { user: toSafe(user), ...tokens };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
  }
  if (user.deletedAt) {
    throw new HttpError(401, 'ACCOUNT_DELETED', 'Аккаунт удалён');
  }
  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
  }
  const tokens = makeTokens(user.id, user.role);
  return { user: toSafe(user), ...tokens };
}

export async function refreshTokens(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, 'INVALID_REFRESH', 'Refresh токен невалиден');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new HttpError(401, 'USER_NOT_FOUND', 'Пользователь не найден');
  }
  return makeTokens(user.id, user.role);
}

/** На MVP blacklist-а нет — сами cookies очищаются на уровне контроллера. */
export async function logout(_userId: string) {
  return;
}

export async function getMe(userId: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  return toSafe(user);
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Чтобы не раскрывать, зарегистрирован ли email, всегда возвращаем успех.
  if (!user) return;

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: tokenHash,
      passwordResetExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const webUrl = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000';
  logger.info(`Password reset link: ${webUrl}/reset-password?token=${rawToken}`);
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: tokenHash,
      passwordResetExpiresAt: { gt: new Date() },
    },
  });
  if (!user) {
    throw new HttpError(400, 'INVALID_OR_EXPIRED_TOKEN', 'Ссылка для сброса пароля недействительна или истекла');
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    },
  });
}
