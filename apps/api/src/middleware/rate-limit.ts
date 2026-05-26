import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

const skipInTest = () => process.env.NODE_ENV === 'test';

type RateLimitedRequest = Request & {
  rateLimit?: {
    limit?: number;
    used?: number;
    remaining?: number;
    resetTime?: Date;
  };
};

function envInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function seconds(ms: number) {
  return Math.ceil(ms / 1000);
}

function retryMeta(req: RateLimitedRequest, windowMs: number) {
  const resetAt = req.rateLimit?.resetTime?.getTime() ?? Date.now() + windowMs;
  const retryAfterSeconds = Math.max(1, seconds(resetAt - Date.now()));
  return {
    retryAfterSeconds,
    retryAt: new Date(Date.now() + retryAfterSeconds * 1000).toISOString(),
    limit: req.rateLimit?.limit,
    used: req.rateLimit?.used,
    remaining: req.rateLimit?.remaining,
    windowSeconds: seconds(windowMs),
  };
}

function rateLimitHandler(message: string, windowMs: number) {
  return (req: Request, res: Response, _next: NextFunction, options: Options) => {
    const meta = retryMeta(req as RateLimitedRequest, windowMs);
    res.setHeader('Retry-After', String(meta.retryAfterSeconds));
    res.status(options.statusCode).json({
      error: {
        code: 'RATE_LIMITED',
        message,
        ...meta,
      },
    });
  };
}

const authWindowMs = envInt('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
const passwordResetWindowMs = 60 * 60 * 1000;
const emailVerificationWindowMs = 60 * 60 * 1000;
const projectWindowMs = 60 * 1000;

/** Попытки регистрации с одного IP. */
export const registerLimiter = rateLimit({
  windowMs: authWindowMs,
  limit: envInt('AUTH_REGISTER_RATE_LIMIT', 10),
  skip: skipInTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler('Слишком много попыток регистрации. Подождите перед новой попыткой.', authWindowMs),
});

/** Неудачные попытки входа с одного IP. Успешный вход не расходует лимит. */
export const loginLimiter = rateLimit({
  windowMs: authWindowMs,
  limit: envInt('AUTH_LOGIN_RATE_LIMIT', 5),
  skip: skipInTest,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler('Слишком много неверных попыток входа. Подождите перед повтором.', authWindowMs),
});

/** Запросы восстановления пароля на email в час. */
export const passwordResetLimiter = rateLimit({
  windowMs: passwordResetWindowMs,
  limit: envInt('PASSWORD_RESET_RATE_LIMIT', 3),
  skip: skipInTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const email = (req.body?.email ?? '').toString().toLowerCase().trim();
    return email || ipKeyGenerator(req.ip ?? '');
  },
  handler: rateLimitHandler('Слишком много запросов восстановления пароля. Подождите перед новым письмом.', passwordResetWindowMs),
});

/** Письма подтверждения email на пользователя или IP в час. */
export const emailVerificationLimiter = rateLimit({
  windowMs: emailVerificationWindowMs,
  limit: envInt('EMAIL_VERIFICATION_RATE_LIMIT', 3),
  skip: skipInTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  handler: rateLimitHandler('Слишком много писем подтверждения. Подождите перед новой отправкой.', emailVerificationWindowMs),
});

/** Создания проекта на пользователя за минуту. */
export const projectCreateLimiter = rateLimit({
  windowMs: projectWindowMs,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  handler: rateLimitHandler('Слишком много проектов. Попробуйте через минуту.', projectWindowMs),
});

/** Создания эпизода на пользователя за минуту. */
export const episodeCreateLimiter = rateLimit({
  windowMs: projectWindowMs,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  handler: rateLimitHandler('Слишком много эпизодов. Попробуйте через минуту.', projectWindowMs),
});
