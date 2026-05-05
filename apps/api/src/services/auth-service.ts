import bcrypt from 'bcrypt';
import { prisma } from '@allvision/database';
import type { Role, User } from '@allvision/database';
import type { LoginInput, RegisterInput } from '@allvision/shared';
import { COINS_WELCOME_BONUS } from '@allvision/shared';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

const BCRYPT_COST = 12;

export type SafeUser = Omit<User, 'password'>;

function toSafe(user: User): SafeUser {
  const { password: _password, ...rest } = user;
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
    throw new HttpError(409, 'EMAIL_TAKEN', 'User with this email already exists');
  }

  const welcomeBonus = Number(process.env.WELCOME_COINS_BONUS ?? COINS_WELCOME_BONUS);
  const password = await bcrypt.hash(data.password, BCRYPT_COST);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        password,
        name: data.name,
        coinBalance: welcomeBonus,
      },
    });

    if (welcomeBonus > 0) {
      await tx.coinTransaction.create({
        data: {
          userId: created.id,
          amount: welcomeBonus,
          reason: 'welcome_bonus',
          refType: 'User',
          refId: created.id,
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
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const ok = await bcrypt.compare(input.password, user.password);
  if (!ok) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const tokens = makeTokens(user.id, user.role);
  return { user: toSafe(user), ...tokens };
}

export async function refreshTokens(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, 'INVALID_REFRESH', 'Refresh token is invalid');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new HttpError(401, 'USER_NOT_FOUND', 'User not found');
  }

  return makeTokens(user.id, user.role);
}

export async function logout(_userId: string) {
  return;
}

export async function getMe(userId: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
  return toSafe(user);
}

export async function requestPasswordReset(email: string) {
  logger.info(`Password reset requested for ${email}; reset flow is scheduled for R3.`);
}

export async function resetPassword(_token: string, _newPassword: string) {
  throw new HttpError(501, 'NOT_IMPLEMENTED_R3', 'Password reset will be implemented in R3.');
}
