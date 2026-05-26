import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

const skipInTest = () => process.env.NODE_ENV === 'test';

function envInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const authWindowMs = envInt('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
const authLimitMessage = { error: { code: 'RATE_LIMITED', message: 'Слишком много попыток. Попробуйте позже.' } };

/** Попытки регистрации с одного IP. */
export const registerLimiter = rateLimit({
  windowMs: authWindowMs,
  limit: envInt('AUTH_REGISTER_RATE_LIMIT', 20),
  skip: skipInTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: authLimitMessage,
});

/** Попытки логина с одного IP. */
export const loginLimiter = rateLimit({
  windowMs: authWindowMs,
  limit: envInt('AUTH_LOGIN_RATE_LIMIT', 20),
  skip: skipInTest,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: authLimitMessage,
});

/** 3 запроса сброса пароля на email в час. */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const email = (req.body?.email ?? '').toString().toLowerCase().trim();
    return email || ipKeyGenerator(req.ip ?? '');
  },
  message: { error: { code: 'RATE_LIMITED', message: 'Слишком много запросов. Попробуйте через час.' } },
});

/** 10 созданий проекта на пользователя за минуту. */
export const projectCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: { error: { code: 'RATE_LIMITED', message: 'Слишком много проектов. Попробуйте через минуту.' } },
});

/** 10 созданий эпизода на пользователя за минуту. */
export const episodeCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: { error: { code: 'RATE_LIMITED', message: 'Слишком много эпизодов. Попробуйте через минуту.' } },
});
