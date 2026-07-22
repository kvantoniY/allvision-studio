-- A9: XP, уровни, серии, достижения и награды ребёнка.
-- Только аддитивные изменения; встроенный стартовый каталог вставляется идемпотентно.

CREATE TYPE "XpEventReason" AS ENUM ('LESSON_COMPLETED', 'MISSION', 'INDEPENDENT_ANSWER', 'EFFORT', 'PROJECT', 'STREAK', 'HOMEWORK', 'ACHIEVEMENT', 'MANUAL');
CREATE TYPE "AchievementMetric" AS ENUM ('LESSONS_COMPLETED', 'TOTAL_XP', 'STREAK');
CREATE TYPE "RewardKind" AS ENUM ('BACKGROUND', 'FRAME', 'COSTUME', 'EFFECT', 'ROOM_ITEM', 'LOCATION', 'EMOTION', 'ARTIFACT');

CREATE TABLE "XpEvent" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "lessonId" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" "XpEventReason" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "XpEvent_idempotencyKey_key" ON "XpEvent"("idempotencyKey");
CREATE INDEX "XpEvent_childId_createdAt_idx" ON "XpEvent"("childId", "createdAt");
CREATE INDEX "XpEvent_lessonId_idx" ON "XpEvent"("lessonId");
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RewardItem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL,
    "kind" "RewardKind" NOT NULL,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RewardItem_slug_key" ON "RewardItem"("slug");
CREATE INDEX "RewardItem_kind_isActive_sortOrder_idx" ON "RewardItem"("kind", "isActive", "sortOrder");

CREATE TABLE "AchievementDef" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "metric" "AchievementMetric" NOT NULL,
    "threshold" INTEGER NOT NULL,
    "rewardItemId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementDef_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AchievementDef_slug_key" ON "AchievementDef"("slug");
CREATE INDEX "AchievementDef_isActive_sortOrder_idx" ON "AchievementDef"("isActive", "sortOrder");
ALTER TABLE "AchievementDef" ADD CONSTRAINT "AchievementDef_rewardItemId_fkey" FOREIGN KEY ("rewardItemId") REFERENCES "RewardItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChildAchievement" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "sourceLessonId" TEXT,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildAchievement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChildAchievement_childId_achievementId_key" ON "ChildAchievement"("childId", "achievementId");
CREATE INDEX "ChildAchievement_childId_unlockedAt_idx" ON "ChildAchievement"("childId", "unlockedAt");
ALTER TABLE "ChildAchievement" ADD CONSTRAINT "ChildAchievement_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildAchievement" ADD CONSTRAINT "ChildAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "AchievementDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildAchievement" ADD CONSTRAINT "ChildAchievement_sourceLessonId_fkey" FOREIGN KEY ("sourceLessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChildRewardItem" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "rewardItemId" TEXT NOT NULL,
    "childAssetId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'achievement',
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equippedAt" TIMESTAMP(3),

    CONSTRAINT "ChildRewardItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChildRewardItem_childId_rewardItemId_key" ON "ChildRewardItem"("childId", "rewardItemId");
CREATE INDEX "ChildRewardItem_childId_acquiredAt_idx" ON "ChildRewardItem"("childId", "acquiredAt");
CREATE INDEX "ChildRewardItem_childAssetId_idx" ON "ChildRewardItem"("childAssetId");
ALTER TABLE "ChildRewardItem" ADD CONSTRAINT "ChildRewardItem_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildRewardItem" ADD CONSTRAINT "ChildRewardItem_rewardItemId_fkey" FOREIGN KEY ("rewardItemId") REFERENCES "RewardItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildRewardItem" ADD CONSTRAINT "ChildRewardItem_childAssetId_fkey" FOREIGN KEY ("childAssetId") REFERENCES "ChildAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "RewardItem" ("id", "slug", "title", "description", "icon", "kind", "metadata", "sortOrder", "updatedAt") VALUES
    ('reward_first_frame', 'first-adventure-frame', 'Рамка первооткрывателя', 'Тёплая рамка за первое завершённое приключение.', '🧭', 'FRAME', '{"accent":"orange"}'::jsonb, 10, CURRENT_TIMESTAMP),
    ('reward_streak_background', 'streak-fire-background', 'Огненный фон', 'Фон профиля за серию из трёх учебных дней.', '🔥', 'BACKGROUND', '{"accent":"amber"}'::jsonb, 20, CURRENT_TIMESTAMP),
    ('reward_explorer_costume', 'young-explorer-costume', 'Костюм исследователя', 'Персональный костюм можно связать с готовой генерацией из библиотеки ребёнка.', '🧥', 'COSTUME', '{"requiresPersonalization":true,"tag":"costume"}'::jsonb, 30, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "AchievementDef" ("id", "slug", "title", "description", "icon", "metric", "threshold", "rewardItemId", "sortOrder", "updatedAt") VALUES
    ('achievement_first_lesson', 'first-lesson', 'Первое приключение', 'Завершить первый живой урок.', '🚀', 'LESSONS_COMPLETED', 1, 'reward_first_frame', 10, CURRENT_TIMESTAMP),
    ('achievement_streak_three', 'streak-three', 'Огонь не гаснет', 'Учиться три дня подряд, используя заморозку при одном пропуске.', '🔥', 'STREAK', 3, 'reward_streak_background', 20, CURRENT_TIMESTAMP),
    ('achievement_xp_hundred', 'xp-hundred', 'Юный исследователь', 'Набрать 100 XP.', '🏆', 'TOTAL_XP', 100, 'reward_explorer_costume', 30, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
