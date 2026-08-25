-- Возврат к Allvision Studio: полное удаление данных и схемы Allvision Academy.
-- Код Academy сохранён в git: ветка `academy`, тег `v0.3-academy-final`.
-- Миграция аддитивна к истории (A1-A13 остаются в _prisma_migrations как факт),
-- но приводит схему БД обратно к состоянию тега v0.2-allvision-studio-final.
--
-- ВАЖНО: перед применением на проде снимается дамп БД (см. CLAUDE.md, раздел «Возврат к Studio»).

-- 1. Роли Academy -> обычный пользователь.
--    Обязательно ДО пересоздания типа Role: Prisma-клиент Studio не знает PARENT/TEACHER/METHODIST
--    и падает при чтении такого пользователя.
UPDATE "User" SET "role" = 'USER' WHERE "role" IN ('PARENT', 'TEACHER', 'METHODIST');

-- 2. Платежи за абонементы занятий -> обычное пополнение (исходное назначение сохраняем в metadata).
UPDATE "Payment"
SET "purpose" = 'TOPUP',
    "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"legacyPurpose":"LESSON_PACKAGE"}'::jsonb
WHERE "purpose" = 'LESSON_PACKAGE';

-- 3. Проекты генераций Academy (персонажи детей, материалы уроков, нейролаборатория).
--    AIUsageLog.projectId = ON DELETE SET NULL, поэтому учёт расходов сохраняется.
DELETE FROM "Project" WHERE "mode" IN ('character-profile', 'academy-generation', 'lesson-lab');

-- 4. Учебные медиа-материалы Academy из общей медиатеки.
DELETE FROM "MediaAsset" WHERE "kind" LIKE 'academy-%';

-- 5. Таблицы Academy.
DROP TABLE IF EXISTS "AccessLog" CASCADE;
DROP TABLE IF EXISTS "DeletionLog" CASCADE;
DROP TABLE IF EXISTS "TeacherPayout" CASCADE;
DROP TABLE IF EXISTS "ThreadMessage" CASCADE;
DROP TABLE IF EXISTS "Thread" CASCADE;
DROP TABLE IF EXISTS "LessonReport" CASCADE;
DROP TABLE IF EXISTS "TeacherStudentNote" CASCADE;
DROP TABLE IF EXISTS "ChildRewardItem" CASCADE;
DROP TABLE IF EXISTS "ChildAchievement" CASCADE;
DROP TABLE IF EXISTS "AchievementDef" CASCADE;
DROP TABLE IF EXISTS "RewardItem" CASCADE;
DROP TABLE IF EXISTS "XpEvent" CASCADE;
DROP TABLE IF EXISTS "LessonInstanceSceneAsset" CASCADE;
DROP TABLE IF EXISTS "LessonChatMessage" CASCADE;
DROP TABLE IF EXISTS "LessonInstance" CASCADE;
DROP TABLE IF EXISTS "LessonTemplateVersion" CASCADE;
DROP TABLE IF EXISTS "LessonTemplate" CASCADE;
DROP TABLE IF EXISTS "ChildAsset" CASCADE;
DROP TABLE IF EXISTS "TeacherEarning" CASCADE;
DROP TABLE IF EXISTS "Lesson" CASCADE;
DROP TABLE IF EXISTS "LessonCredit" CASCADE;
DROP TABLE IF EXISTS "TeacherSlot" CASCADE;
DROP TABLE IF EXISTS "TeacherProfile" CASCADE;
DROP TABLE IF EXISTS "TopicChangeLog" CASCADE;
DROP TABLE IF EXISTS "SkillProgress" CASCADE;
DROP TABLE IF EXISTS "TopicProgress" CASCADE;
DROP TABLE IF EXISTS "Enrollment" CASCADE;
DROP TABLE IF EXISTS "CharacterReference" CASCADE;
DROP TABLE IF EXISTS "CharacterProfile" CASCADE;
DROP TABLE IF EXISTS "TopicSkill" CASCADE;
DROP TABLE IF EXISTS "SkillDef" CASCADE;
DROP TABLE IF EXISTS "Topic" CASCADE;
DROP TABLE IF EXISTS "CourseModule" CASCADE;
DROP TABLE IF EXISTS "Course" CASCADE;
DROP TABLE IF EXISTS "Subject" CASCADE;
DROP TABLE IF EXISTS "ChildPhoto" CASCADE;
DROP TABLE IF EXISTS "Consent" CASCADE;
DROP TABLE IF EXISTS "ChildProfile" CASCADE;

-- 6. Типы Academy.
DROP TYPE IF EXISTS "DeletionStatus";
DROP TYPE IF EXISTS "DeletionScope";
DROP TYPE IF EXISTS "ThreadMessageRole";
DROP TYPE IF EXISTS "RewardKind";
DROP TYPE IF EXISTS "AchievementMetric";
DROP TYPE IF EXISTS "XpEventReason";
DROP TYPE IF EXISTS "EarningStatus";
DROP TYPE IF EXISTS "LessonStatus";
DROP TYPE IF EXISTS "TopicChangeReason";
DROP TYPE IF EXISTS "TopicProgressStatus";
DROP TYPE IF EXISTS "EnrollmentStatus";
DROP TYPE IF EXISTS "CharacterProfileStatus";
DROP TYPE IF EXISTS "ConsentType";

-- 7. Колонки Academy в существующих таблицах Studio.
ALTER TABLE "MediaAsset"
  DROP COLUMN IF EXISTS "generationModel",
  DROP COLUMN IF EXISTS "generationPrompt",
  DROP COLUMN IF EXISTS "generationCostUsd",
  DROP COLUMN IF EXISTS "generationParams";

-- 8. Enum-значения Academy: Postgres не умеет DROP VALUE, поэтому типы пересоздаются.
--    Безопасно только после шагов 1-2 (значений Academy в данных уже нет).
ALTER TYPE "Role" RENAME TO "Role_academy_old";
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'READONLY_ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
DROP TYPE "Role_academy_old";

ALTER TYPE "PaymentPurpose" RENAME TO "PaymentPurpose_academy_old";
CREATE TYPE "PaymentPurpose" AS ENUM ('TOPUP', 'ORDER');
ALTER TABLE "Payment" ALTER COLUMN "purpose" TYPE "PaymentPurpose" USING ("purpose"::text::"PaymentPurpose");
DROP TYPE "PaymentPurpose_academy_old";

-- 9. Публичное имя компании обратно на Studio (prod-seed идемпотентен и существующие Setting не переписывает).
UPDATE "Setting" SET "value" = 'Allvision Studio' WHERE "key" = 'company_name';
