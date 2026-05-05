import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  updateProfileSchema,
  changeAccountPasswordSchema,
  deleteAccountSchema,
} from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies';
import * as account from '../services/account-service';

export const accountRouter = Router();

accountRouter.use(requireAuth);

accountRouter.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await account.getDashboard(req.user!.id);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

accountRouter.get('/transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const typeRaw = String(req.query.type ?? 'all');
    const type = typeRaw === 'topup' || typeRaw === 'spending' ? typeRaw : 'all';
    const data = await account.listTransactions(req.user!.id, { page, limit, type });
    res.json(data);
  } catch (e) {
    next(e);
  }
});

accountRouter.patch('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateProfileSchema.parse(req.body);
    const user = await account.updateProfile(req.user!.id, data);
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

accountRouter.post('/profile/password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { oldPassword, newPassword } = changeAccountPasswordSchema.parse(req.body);
    const authTokens = await account.changePassword(req.user!.id, oldPassword, newPassword);
    setAuthCookies(res, authTokens.accessToken, authTokens.refreshToken);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

accountRouter.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = deleteAccountSchema.parse(req.body);
    await account.deleteAccount(req.user!.id, password);
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
