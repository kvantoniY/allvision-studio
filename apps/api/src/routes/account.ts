import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  updateProfileSchema,
  changeAccountPasswordSchema,
  deleteAccountSchema,
} from '@allvision/shared';
import { prisma } from '@allvision/database';
import { requireAuth } from '../middleware/auth';
import { uploadProfileAvatar } from '../middleware/upload';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies';
import { HttpError } from '../utils/http-error';
import * as account from '../services/account-service';
import * as fileService from '../services/file-service';
import { requestAccountDeletion } from '../services/academy-deletion-service';

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

accountRouter.get('/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const data = await account.listPayments(req.user!.id, { page, limit });
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

accountRouter.post('/profile/avatar', uploadProfileAvatar, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Image file is required');
    const userId = req.user!.id;
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });
    const uploaded = await fileService.uploadProfileAvatar(userId, req.file.buffer, req.file.mimetype);
    const user = await account.updateProfile(userId, { avatar: uploaded.url });
    const oldKey = profileAvatarStorageKey(current?.avatar, userId);
    if (oldKey && oldKey !== uploaded.key) {
      fileService.deleteFile(oldKey).catch(() => undefined);
    }
    res.json({ user, avatar: uploaded.url });
  } catch (e) {
    next(e);
  }
});

accountRouter.post('/profile/password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { oldPassword, newPassword } = changeAccountPasswordSchema.parse(req.body);
    const tokens = await account.changePassword(req.user!.id, oldPassword, newPassword);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

function profileAvatarStorageKey(value: string | null | undefined, userId: string): string | null {
  if (!value) return null;
  let raw = value.trim();
  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      return null;
    }
  }
  raw = raw.replace(/^\/+/, '');
  if (raw.startsWith('static/')) raw = raw.slice('static/'.length);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return raw.startsWith(`user-uploads/profile/${userId}/`) ? raw : null;
}

accountRouter.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = deleteAccountSchema.parse(req.body);
    const candidate = await account.deleteAccount(req.user!.id, password);
    const deletion = await requestAccountDeletion(
      req.user!.id,
      profileAvatarStorageKey(candidate.avatar, req.user!.id),
    );
    clearAuthCookies(res);
    res.status(202).json({ ok: true, deletion });
  } catch (e) {
    next(e);
  }
});
