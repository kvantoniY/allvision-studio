import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

/** 5 попыток логина/регистрации с одного IP за 15 минут. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Слишком много попыток. Попробуйте позже.' } },
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
