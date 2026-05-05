import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } },
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const email = (req.body?.email ?? '').toString().toLowerCase().trim();
    return email || ipKeyGenerator(req.ip ?? '');
  },
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in an hour.' } },
});

export const generationCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: { error: { code: 'RATE_LIMITED', message: 'Too many generation requests. Try again shortly.' } },
});
