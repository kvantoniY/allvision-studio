import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '@allvision/database';
import { teacherRewardGrantSchema, teacherXpGrantSchema } from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { requireParent, requireRole } from '../middleware/require-role';
import { readChildAsset } from '../services/child-photo-storage';
import {
  assertTeacherAssigned,
  equipChildReward,
  getKidProfile,
  getTeacherRewardCatalog,
  grantTeacherReward,
  grantTeacherXp,
} from '../services/academy-gamification-service';
import { HttpError } from '../utils/http-error';

export const academyGamificationRouter = Router();

academyGamificationRouter.get('/kids/:childId/profile', requireAuth, requireParent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ profile: await getKidProfile(req.user!.id, req.params.childId) });
  } catch (error) {
    next(error);
  }
});

academyGamificationRouter.post('/kids/:childId/rewards/:rewardId/equip', requireAuth, requireParent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await equipChildReward(req.user!.id, req.params.childId, req.params.rewardId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

academyGamificationRouter.get('/kids/:childId/rewards/:rewardId/asset', requireAuth, requireParent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owned = await prisma.childRewardItem.findFirst({
      where: {
        id: req.params.rewardId,
        childId: req.params.childId,
        child: { parentId: req.user!.id, deletedAt: null },
        childAssetId: { not: null },
      },
      include: { childAsset: true },
    });
    if (!owned?.childAsset) throw new HttpError(404, 'REWARD_ASSET_NOT_FOUND', 'Персональный образ награды не найден');
    const buffer = await readChildAsset(owned.childAsset.storageKey).catch(() => {
      throw new HttpError(404, 'REWARD_ASSET_FILE_MISSING', 'Файл персонального образа недоступен');
    });
    res.setHeader('Content-Type', owned.childAsset.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

academyGamificationRouter.get('/teacher/children/:childId/catalog', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertTeacherAssigned(req.user!.id, req.params.childId);
    res.json(await getTeacherRewardCatalog(req.params.childId));
  } catch (error) {
    next(error);
  }
});

academyGamificationRouter.post('/teacher/children/:childId/xp', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = teacherXpGrantSchema.parse(req.body);
    await assertTeacherAssigned(req.user!.id, req.params.childId);
    const awarded = await grantTeacherXp({
      teacherUserId: req.user!.id,
      childId: req.params.childId,
      ...input,
    });
    res.status(awarded ? 201 : 200).json({ ok: true, awarded });
  } catch (error) {
    next(error);
  }
});

academyGamificationRouter.post('/teacher/children/:childId/rewards', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = teacherRewardGrantSchema.parse(req.body);
    await assertTeacherAssigned(req.user!.id, req.params.childId);
    const reward = await grantTeacherReward({
      teacherUserId: req.user!.id,
      childId: req.params.childId,
      ...input,
    });
    res.status(201).json({ rewardId: reward.id });
  } catch (error) {
    next(error);
  }
});
