import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '@allvision/database';
import type { Role, User } from '@allvision/database';
import type { RegisterInput, LoginInput } from '@allvision/shared';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { sendTransactionalEmail } from './mail-service';

const BCRYPT_COST = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 час
const EMAIL_VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export type SafeUser = Omit<
  User,
  'passwordHash' | 'passwordResetToken' | 'passwordResetExpiresAt' | 'emailVerifyToken' | 'emailVerifyExpiresAt'
>;

function toSafe(user: User): SafeUser {
  const {
    passwordHash: _p,
    passwordResetToken: _t,
    passwordResetExpiresAt: _e,
    emailVerifyToken: _evt,
    emailVerifyExpiresAt: _eve,
    ...rest
  } = user;
  return rest;
}

function makeTokens(userId: string, role: Role) {
  return {
    accessToken: signAccessToken(userId, role),
    refreshToken: signRefreshToken(userId),
  };
}

function tokenFingerprint(token: string) {
  return `${token.slice(0, 8)}:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 12)}`;
}

function logIssuedTokens(flow: string, user: Pick<User, 'id' | 'email' | 'role'>, tokens: { accessToken: string; refreshToken: string }) {
  logger.info(
    `[auth] issued flow=${flow} userId=${user.id} email=${user.email} role=${user.role} `
    + `access=${tokenFingerprint(tokens.accessToken)} refresh=${tokenFingerprint(tokens.refreshToken)}`,
  );
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function appUrl(path: string) {
  const webUrl = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000';
  return `${webUrl.replace(/\/+$/, '')}${path}`;
}

function htmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function emailLayout(title: string, body: string, ctaLabel: string, ctaUrl: string) {
  const safeUrl = htmlEscape(ctaUrl);
  return `
    <div style="font-family:Arial,sans-serif;background:#0f172a;padding:32px;color:#e2e8f0">
      <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #263244;border-radius:12px;padding:28px">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#ffffff">${htmlEscape(title)}</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#cbd5e1">${body}</p>
        <a href="${safeUrl}" style="display:inline-block;background:#f59e0b;color:#0f172a;text-decoration:none;font-weight:700;border-radius:8px;padding:12px 18px">${htmlEscape(ctaLabel)}</a>
        <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#94a3b8">Если кнопка не открывается, скопируйте ссылку:<br><span style="word-break:break-all">${safeUrl}</span></p>
      </div>
    </div>
  `;
}

async function sendEmailVerification(user: Pick<User, 'email' | 'name'>, rawToken: string) {
  const verifyUrl = appUrl(`/verify-email?token=${encodeURIComponent(rawToken)}`);
  const name = user.name?.trim() || user.email;
  const result = await sendTransactionalEmail({
    to: user.email,
    subject: 'Подтвердите email в Allvision Studio',
    html: emailLayout(
      'Подтвердите email',
      `Здравствуйте, ${htmlEscape(name)}. Подтвердите электронную почту, чтобы восстановить доступ к аккаунту при потере пароля.`,
      'Подтвердить email',
      verifyUrl,
    ),
    text: `Подтвердите email в Allvision Studio: ${verifyUrl}`,
  });
  if (!result.sent && process.env.NODE_ENV !== 'production') {
    logger.info(`[auth] email verification link: ${verifyUrl}`);
  }
  return result;
}

async function sendPasswordReset(user: Pick<User, 'email' | 'name'>, rawToken: string) {
  const resetUrl = appUrl(`/reset-password?token=${encodeURIComponent(rawToken)}`);
  const name = user.name?.trim() || user.email;
  const result = await sendTransactionalEmail({
    to: user.email,
    subject: 'Восстановление пароля Allvision Studio',
    html: emailLayout(
      'Восстановление пароля',
      `Здравствуйте, ${htmlEscape(name)}. Нажмите кнопку ниже, чтобы задать новый пароль. Ссылка действует 1 час.`,
      'Сбросить пароль',
      resetUrl,
    ),
    text: `Сбросить пароль Allvision Studio: ${resetUrl}`,
  });
  if (!result.sent && process.env.NODE_ENV !== 'production') {
    logger.info(`[auth] password reset link: ${resetUrl}`);
  }
  return result;
}

/**
 * Стартовый баланс нового пользователя.
 *
 * Значение живёт в коде, а не в env: раньше оно читалось из WELCOME_TOKENS_BONUS, и прод-.env
 * молча перебивал продуктовое решение — поменянный в коде бонус на сайте не появлялся, пока
 * кто-то руками не отредактировал env на ВМ. Это решение продукта, а не настройка окружения:
 * меняется тут, приезжает деплоем, покрыто тестом.
 */
export const WELCOME_BONUS_TOKENS = 5;

export async function register(data: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new HttpError(409, 'EMAIL_TAKEN', 'Пользователь с таким email уже существует');
  }

  const welcomeBonus = WELCOME_BONUS_TOKENS;
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
  logIssuedTokens('register', user, tokens);
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
  logIssuedTokens('login', user, tokens);
  return { user: toSafe(user), ...tokens };
}

export async function refreshTokens(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    logger.warn(`[auth] refresh rejected reason=INVALID_REFRESH refresh=${tokenFingerprint(refreshToken)} error=${(err as Error).message}`);
    throw new HttpError(401, 'INVALID_REFRESH', 'Refresh токен невалиден');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    logger.warn(`[auth] refresh rejected reason=USER_NOT_FOUND userId=${payload.sub} refresh=${tokenFingerprint(refreshToken)}`);
    throw new HttpError(401, 'USER_NOT_FOUND', 'Пользователь не найден');
  }
  const tokens = makeTokens(user.id, user.role);
  logIssuedTokens('refresh', user, tokens);
  return { user: toSafe(user), ...tokens };
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
  if (!user.emailVerifiedAt) {
    logger.info(`[auth] password reset skipped for unverified email=${email}`);
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: tokenHash,
      passwordResetExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  await sendPasswordReset(user, rawToken);
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashToken(token);
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

export async function requestEmailVerification(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  if (user.emailVerifiedAt) return { alreadyVerified: true };

  const rawToken = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyToken: hashToken(rawToken),
      emailVerifyExpiresAt: new Date(Date.now() + EMAIL_VERIFY_TOKEN_TTL_MS),
    },
  });

  const result = await sendEmailVerification(user, rawToken);
  if (!result.sent && process.env.NODE_ENV === 'production') {
    throw new HttpError(503, 'EMAIL_NOT_CONFIGURED', 'Отправка email пока не настроена');
  }
  return { alreadyVerified: false };
}

export async function confirmEmailVerification(token: string) {
  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: {
      emailVerifyToken: tokenHash,
      emailVerifyExpiresAt: { gt: new Date() },
    },
  });
  if (!user) {
    throw new HttpError(400, 'INVALID_OR_EXPIRED_TOKEN', 'Ссылка подтверждения недействительна или истекла');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerifyToken: null,
      emailVerifyExpiresAt: null,
    },
  });
}
