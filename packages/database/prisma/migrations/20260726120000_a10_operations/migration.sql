-- A10: отчёты, родительско-учительские диалоги, периоды выплат и аудит удаления.
-- Все изменения аддитивны; существующие финансовые и учебные связи не переписываются.

CREATE TYPE "ThreadMessageRole" AS ENUM ('PARENT', 'TEACHER', 'ADMIN', 'SYSTEM');
CREATE TYPE "DeletionScope" AS ENUM ('CHILD', 'ACCOUNT');
CREATE TYPE "DeletionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "ChildProfile" ADD COLUMN "anonymizedKey" TEXT;
ALTER TABLE "ChildProfile" ADD COLUMN "anonymizedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "ChildProfile_anonymizedKey_key" ON "ChildProfile"("anonymizedKey");

CREATE TABLE "LessonReport" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "createdById" TEXT,
    "summary" TEXT NOT NULL,
    "successes" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "resultAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parentReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LessonReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LessonReport_lessonId_key" ON "LessonReport"("lessonId");
CREATE INDEX "LessonReport_createdAt_idx" ON "LessonReport"("createdAt");
ALTER TABLE "LessonReport" ADD CONSTRAINT "LessonReport_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonReport" ADD CONSTRAINT "LessonReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Thread_parentId_teacherId_childId_key" ON "Thread"("parentId", "teacherId", "childId");
CREATE INDEX "Thread_parentId_updatedAt_idx" ON "Thread"("parentId", "updatedAt");
CREATE INDEX "Thread_teacherId_updatedAt_idx" ON "Thread"("teacherId", "updatedAt");
CREATE INDEX "Thread_childId_idx" ON "Thread"("childId");
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ThreadMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT,
    "role" "ThreadMessageRole" NOT NULL,
    "body" TEXT,
    "attachmentStorageKey" TEXT,
    "attachmentFileName" TEXT,
    "attachmentMimeType" TEXT,
    "attachmentFileSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThreadMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ThreadMessage_threadId_createdAt_idx" ON "ThreadMessage"("threadId", "createdAt");
CREATE INDEX "ThreadMessage_authorId_idx" ON "ThreadMessage"("authorId");
ALTER TABLE "ThreadMessage" ADD CONSTRAINT "ThreadMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadMessage" ADD CONSTRAINT "ThreadMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TeacherPayout" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountRub" INTEGER NOT NULL,
    "status" "EarningStatus" NOT NULL DEFAULT 'AVAILABLE',
    "confirmationStorageKey" TEXT,
    "confirmationFileName" TEXT,
    "confirmationMimeType" TEXT,
    "rejectionReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeacherPayout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeacherPayout_teacherId_periodStart_periodEnd_key" ON "TeacherPayout"("teacherId", "periodStart", "periodEnd");
CREATE INDEX "TeacherPayout_status_periodEnd_idx" ON "TeacherPayout"("status", "periodEnd");
ALTER TABLE "TeacherPayout" ADD CONSTRAINT "TeacherPayout_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherPayout" ADD CONSTRAINT "TeacherPayout_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeacherEarning" ADD COLUMN "payoutId" TEXT;
CREATE INDEX "TeacherEarning_payoutId_idx" ON "TeacherEarning"("payoutId");
ALTER TABLE "TeacherEarning" ADD CONSTRAINT "TeacherEarning_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "TeacherPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DeletionLog" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT,
    "scope" "DeletionScope" NOT NULL,
    "targetHash" TEXT NOT NULL,
    "status" "DeletionStatus" NOT NULL DEFAULT 'PENDING',
    "summary" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "DeletionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeletionLog_requestedById_createdAt_idx" ON "DeletionLog"("requestedById", "createdAt");
CREATE INDEX "DeletionLog_status_createdAt_idx" ON "DeletionLog"("status", "createdAt");
CREATE INDEX "DeletionLog_targetHash_idx" ON "DeletionLog"("targetHash");
ALTER TABLE "DeletionLog" ADD CONSTRAINT "DeletionLog_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "childId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessLog_childId_createdAt_idx" ON "AccessLog"("childId", "createdAt");
CREATE INDEX "AccessLog_actorId_createdAt_idx" ON "AccessLog"("actorId", "createdAt");
CREATE INDEX "AccessLog_resourceType_resourceId_idx" ON "AccessLog"("resourceType", "resourceId");
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Существующие записи на уроки тоже получают единый диалог родитель↔преподаватель.
INSERT INTO "Thread" ("id", "parentId", "teacherId", "childId", "createdAt", "updatedAt")
SELECT
    'legacy_thread_' || md5(c."parentId" || ':' || l."teacherId" || ':' || l."childId"),
    c."parentId",
    l."teacherId",
    l."childId",
    MIN(l."createdAt"),
    CURRENT_TIMESTAMP
FROM "Lesson" l
JOIN "ChildProfile" c ON c."id" = l."childId"
GROUP BY c."parentId", l."teacherId", l."childId"
ON CONFLICT ("parentId", "teacherId", "childId") DO NOTHING;

INSERT INTO "ThreadMessage" ("id", "threadId", "role", "body", "createdAt")
SELECT
    'legacy_message_' || md5(t."id"),
    t."id",
    'SYSTEM'::"ThreadMessageRole",
    'Диалог создан по существующей записи на занятие.',
    t."createdAt"
FROM "Thread" t
WHERE NOT EXISTS (SELECT 1 FROM "ThreadMessage" m WHERE m."threadId" = t."id");
