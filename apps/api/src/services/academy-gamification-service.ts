import {
  prisma,
  type AchievementMetric,
  type Prisma,
  type RewardKind,
  type XpEventReason,
} from '@allvision/database';
import {
  ACADEMY_ASSET_KIND_LABELS,
  LESSON_COMPLETED_XP,
  REWARD_KIND_LABELS,
  XP_REASON_LABELS,
  levelFromXp,
  levelProgressFromXp,
  updateLessonStreak,
  type KidProfileDto,
  type TeacherRewardAssetDto,
  type TeacherRewardCatalogItem,
  type XpEventReasonValue,
} from '@allvision/shared';
import { HttpError } from '../utils/http-error';

type TransactionClient = Prisma.TransactionClient;

function achievementProgress(metric: AchievementMetric, values: {
  completedLessons: number;
  xp: number;
  streakCount: number;
}): number {
  if (metric === 'LESSONS_COMPLETED') return values.completedLessons;
  if (metric === 'TOTAL_XP') return values.xp;
  return values.streakCount;
}

async function unlockReachedAchievements(
  tx: TransactionClient,
  childId: string,
  sourceLessonId: string | null,
  values: { completedLessons: number; xp: number; streakCount: number },
) {
  const definitions = await tx.achievementDef.findMany({ where: { isActive: true } });
  const reached = definitions.filter((definition) => (
    achievementProgress(definition.metric, values) >= definition.threshold
  ));
  if (reached.length === 0) return;

  await tx.childAchievement.createMany({
    data: reached.map((definition) => ({
      childId,
      achievementId: definition.id,
      sourceLessonId,
    })),
    skipDuplicates: true,
  });

  const rewards = reached.filter((definition) => definition.rewardItemId);
  if (rewards.length > 0) {
    await tx.childRewardItem.createMany({
      data: rewards.map((definition) => ({
        childId,
        rewardItemId: definition.rewardItemId!,
        source: `achievement:${definition.slug}`,
      })),
      skipDuplicates: true,
    });
  }
}

/** Идемпотентный хук завершения урока: XP, уровень, серия и достижения одной транзакцией. */
export async function awardLessonCompletion(
  tx: TransactionClient,
  lesson: { id: string; childId: string },
  completedAt = new Date(),
): Promise<boolean> {
  const idempotencyKey = `lesson-completed:${lesson.id}`;
  const child = await tx.childProfile.findUnique({ where: { id: lesson.childId } });
  if (!child) throw new HttpError(404, 'CHILD_NOT_FOUND', 'Ребёнок не найден');

  const previousCompletion = await tx.xpEvent.findFirst({
    where: { childId: lesson.childId, reason: 'LESSON_COMPLETED' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const inserted = await tx.xpEvent.createMany({
    data: [{
      childId: lesson.childId,
      lessonId: lesson.id,
      amount: LESSON_COMPLETED_XP,
      reason: 'LESSON_COMPLETED',
      idempotencyKey,
      createdAt: completedAt,
    }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return false;

  const streak = updateLessonStreak({
    previousActivityAt: previousCompletion?.createdAt ?? null,
    currentActivityAt: completedAt,
    streakCount: child.streakCount,
    streakFreezes: child.streakFreezes,
  });
  const updatedChild = await tx.childProfile.update({
    where: { id: child.id },
    data: {
      xp: { increment: LESSON_COMPLETED_XP },
      streakCount: streak.streakCount,
      streakFreezes: streak.streakFreezes,
    },
  });
  const xp = updatedChild.xp;
  await tx.childProfile.update({ where: { id: child.id }, data: { level: levelFromXp(xp) } });
  const completedLessons = await tx.lesson.count({
    where: { childId: child.id, status: 'COMPLETED' },
  });
  await unlockReachedAchievements(tx, child.id, lesson.id, {
    completedLessons,
    xp,
    streakCount: streak.streakCount,
  });
  return true;
}

/** Ручная награда XP от назначенного преподавателя с ключом запроса для идемпотентности. */
export async function grantTeacherXp(input: {
  teacherUserId: string;
  childId: string;
  amount: number;
  reason: XpEventReason;
  requestId: string;
  note?: string;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const child = await tx.childProfile.findUnique({ where: { id: input.childId } });
    if (!child) throw new HttpError(404, 'CHILD_NOT_FOUND', 'Ребёнок не найден');
    const inserted = await tx.xpEvent.createMany({
      data: [{
        childId: child.id,
        amount: input.amount,
        reason: input.reason,
        idempotencyKey: `teacher:${input.teacherUserId}:${input.requestId}`,
        metadata: input.note ? { note: input.note, teacherUserId: input.teacherUserId } : { teacherUserId: input.teacherUserId },
      }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return false;

    const updatedChild = await tx.childProfile.update({
      where: { id: child.id },
      data: { xp: { increment: input.amount } },
    });
    const xp = updatedChild.xp;
    await tx.childProfile.update({ where: { id: child.id }, data: { level: levelFromXp(xp) } });
    const completedLessons = await tx.lesson.count({ where: { childId: child.id, status: 'COMPLETED' } });
    await unlockReachedAchievements(tx, child.id, null, {
      completedLessons,
      xp,
      streakCount: child.streakCount,
    });
    return true;
  });
}

function requiresPersonalizedAsset(metadata: Prisma.JsonValue | null): boolean {
  return Boolean(metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    && (metadata as Prisma.JsonObject).requiresPersonalization === true);
}

export async function grantTeacherReward(input: {
  teacherUserId: string;
  childId: string;
  rewardItemId: string;
  childAssetId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const reward = await tx.rewardItem.findFirst({ where: { id: input.rewardItemId, isActive: true } });
    if (!reward) throw new HttpError(404, 'REWARD_NOT_FOUND', 'Награда не найдена');
    if (requiresPersonalizedAsset(reward.metadata) && !input.childAssetId) {
      throw new HttpError(400, 'REWARD_ASSET_REQUIRED', 'Для костюма выберите готовый материал ребёнка');
    }
    if (input.childAssetId) {
      const asset = await tx.childAsset.findFirst({ where: { id: input.childAssetId, childId: input.childId } });
      if (!asset) throw new HttpError(404, 'CHILD_ASSET_NOT_FOUND', 'Материал ребёнка не найден');
    }
    return tx.childRewardItem.upsert({
      where: { childId_rewardItemId: { childId: input.childId, rewardItemId: reward.id } },
      create: {
        childId: input.childId,
        rewardItemId: reward.id,
        childAssetId: input.childAssetId ?? null,
        source: `teacher:${input.teacherUserId}`,
      },
      update: {
        ...(input.childAssetId ? { childAssetId: input.childAssetId } : {}),
      },
    });
  });
}

export async function equipChildReward(parentId: string, childId: string, childRewardId: string) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.childRewardItem.findFirst({
      where: { id: childRewardId, childId, child: { parentId, deletedAt: null } },
      include: { rewardItem: true },
    });
    if (!owned) throw new HttpError(404, 'CHILD_REWARD_NOT_FOUND', 'Награда ребёнка не найдена');
    if (requiresPersonalizedAsset(owned.rewardItem.metadata) && !owned.childAssetId) {
      throw new HttpError(409, 'REWARD_ASSET_REQUIRED', 'Для этого костюма ещё не готов персональный образ');
    }
    await tx.childRewardItem.updateMany({
      where: { childId, rewardItem: { kind: owned.rewardItem.kind }, equippedAt: { not: null } },
      data: { equippedAt: null },
    });
    return tx.childRewardItem.update({ where: { id: owned.id }, data: { equippedAt: new Date() } });
  });
}

export async function assertTeacherAssigned(teacherUserId: string, childId: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { childId, teacher: { userId: teacherUserId }, child: { deletedAt: null } },
    select: { id: true },
  });
  if (!lesson) throw new HttpError(403, 'CHILD_NOT_ASSIGNED', 'Ребёнок не назначен этому преподавателю');
}

export async function getTeacherRewardCatalog(childId: string): Promise<{
  rewards: TeacherRewardCatalogItem[];
  assets: TeacherRewardAssetDto[];
}> {
  const [rewards, assets] = await Promise.all([
    prisma.rewardItem.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] }),
    prisma.childAsset.findMany({ where: { childId }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  return {
    rewards: rewards.map((reward) => ({
      id: reward.id,
      title: reward.title,
      description: reward.description,
      icon: reward.icon,
      kind: reward.kind,
      kindLabel: REWARD_KIND_LABELS[reward.kind],
    })),
    assets: assets.map((asset) => ({
      id: asset.id,
      title: asset.title,
      kind: ACADEMY_ASSET_KIND_LABELS[asset.kind as keyof typeof ACADEMY_ASSET_KIND_LABELS] ?? asset.kind,
      fileUrl: `/api/academy/materials/library/child/${asset.id}/file`,
    })),
  };
}

export async function getKidProfile(parentId: string, childId: string): Promise<KidProfileDto> {
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, parentId, deletedAt: null },
    include: {
      characterProfile: {
        include: { references: { orderBy: { createdAt: 'asc' }, take: 1 } },
      },
      achievements: true,
      rewardItems: true,
      xpEvents: { orderBy: { createdAt: 'desc' }, take: 12 },
    },
  });
  if (!child) throw new HttpError(404, 'CHILD_NOT_FOUND', 'Профиль ребёнка не найден');
  const [completedLessons, achievementDefs, rewardItems] = await Promise.all([
    prisma.lesson.count({ where: { childId, status: 'COMPLETED' } }),
    prisma.achievementDef.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] }),
    prisma.rewardItem.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] }),
  ]);
  const unlockedById = new Map(child.achievements.map((item) => [item.achievementId, item]));
  const ownedById = new Map(child.rewardItems.map((item) => [item.rewardItemId, item]));
  const characterRef = child.characterProfile?.references[0];
  return {
    child: {
      id: child.id,
      name: child.name,
      level: child.level,
      xp: child.xp,
      streakCount: child.streakCount,
      streakFreezes: child.streakFreezes,
      characterImageUrl: characterRef
        ? `/api/family/children/${child.id}/character/references/${characterRef.id}/file`
        : child.avatar,
    },
    levelProgress: levelProgressFromXp(child.xp),
    completedLessons,
    achievements: achievementDefs.map((definition) => ({
      id: definition.id,
      slug: definition.slug,
      title: definition.title,
      description: definition.description,
      icon: definition.icon,
      metric: definition.metric,
      threshold: definition.threshold,
      progress: Math.min(definition.threshold, achievementProgress(definition.metric, {
        completedLessons,
        xp: child.xp,
        streakCount: child.streakCount,
      })),
      unlockedAt: unlockedById.get(definition.id)?.unlockedAt.toISOString() ?? null,
    })),
    rewards: rewardItems.map((reward) => {
      const owned = ownedById.get(reward.id);
      return {
        rewardItemId: reward.id,
        childRewardId: owned?.id ?? null,
        slug: reward.slug,
        title: reward.title,
        description: reward.description,
        icon: reward.icon,
        kind: reward.kind,
        kindLabel: REWARD_KIND_LABELS[reward.kind],
        owned: Boolean(owned),
        acquiredAt: owned?.acquiredAt.toISOString() ?? null,
        equipped: Boolean(owned?.equippedAt),
        childAssetId: owned?.childAssetId ?? null,
        assetFileUrl: owned?.childAssetId
          ? `/api/academy/gamification/kids/${child.id}/rewards/${owned.id}/asset`
          : null,
      };
    }),
    recentXp: child.xpEvents.map((event) => ({
      id: event.id,
      amount: event.amount,
      reason: event.reason as XpEventReasonValue,
      reasonLabel: XP_REASON_LABELS[event.reason],
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export function rewardKindLabel(kind: RewardKind): string {
  return REWARD_KIND_LABELS[kind];
}
