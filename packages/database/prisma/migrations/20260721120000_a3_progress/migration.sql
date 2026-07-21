-- A3: прогресс обучения — запись на курс, прогресс по темам и навыкам, журнал смены темы

CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');
CREATE TYPE "TopicProgressStatus" AS ENUM ('LOCKED', 'RECOMMENDED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "TopicChangeReason" AS ENUM ('REPEAT', 'GAP', 'PARENT_WISH', 'SPECIAL_PROJECT');

CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Enrollment_childId_courseId_key" ON "Enrollment"("childId", "courseId");
CREATE INDEX "Enrollment_childId_idx" ON "Enrollment"("childId");

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TopicProgress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" "TopicProgressStatus" NOT NULL DEFAULT 'LOCKED',
    "completedAt" TIMESTAMP(3),
    "teacherNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TopicProgress_enrollmentId_topicId_key" ON "TopicProgress"("enrollmentId", "topicId");
CREATE INDEX "TopicProgress_enrollmentId_idx" ON "TopicProgress"("enrollmentId");

ALTER TABLE "TopicProgress" ADD CONSTRAINT "TopicProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopicProgress" ADD CONSTRAINT "TopicProgress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SkillProgress" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SkillProgress_childId_skillId_key" ON "SkillProgress"("childId", "skillId");
CREATE INDEX "SkillProgress_childId_idx" ON "SkillProgress"("childId");

ALTER TABLE "SkillProgress" ADD CONSTRAINT "SkillProgress_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillProgress" ADD CONSTRAINT "SkillProgress_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "SkillDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TopicChangeLog" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "fromTopicId" TEXT,
    "toTopicId" TEXT NOT NULL,
    "reason" "TopicChangeReason" NOT NULL,
    "note" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TopicChangeLog_enrollmentId_idx" ON "TopicChangeLog"("enrollmentId");

ALTER TABLE "TopicChangeLog" ADD CONSTRAINT "TopicChangeLog_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
