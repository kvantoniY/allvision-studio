import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@allvision/shared';
import * as authService from '../services/auth-service';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies';
import { requireAuth } from '../middleware/auth';
import { authLimiter, passwordResetLimiter } from '../middleware/rate-limit';
import { HttpError } from '../utils/http-error';

export const authRouter = Router();

authRouter.post('/register', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.register(data);
    setAuthCookies(res, accessToken, refreshToken);
    res.status(201).json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await authService.login(data);
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // authService.logout сейчас no-op, но зовём для будущего blacklist-а.
    if (req.cookies?.accessToken) {
      // ignore — не валидируем токен на logout
    }
    await authService.logout('');
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) throw new HttpError(401, 'NO_REFRESH_TOKEN', 'Refresh токен отсутствует');
    const tokens = await authService.refreshTokens(refreshToken);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await authService.getMe(req.user!.id);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/forgot-password', passwordResetLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.requestPasswordReset(email);
    // Всегда 200, даже если email не существует — чтобы не раскрывать базу.
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, newPassword);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
