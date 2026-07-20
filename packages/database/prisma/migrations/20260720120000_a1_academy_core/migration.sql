-- A1: Allvision Academy core — роли, профили детей, согласия, фото, учебная программа

-- Роли Academy
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PARENT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'TEACHER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'METHODIST';

-- Типы согласий
CREATE TYPE "ConsentType" AS ENUM ('IMAGE_PROCESSING', 'AI_CHARACTER', 'AI_GENERATION', 'EXTERNAL_PROVIDERS', 'DATA_RETENTION');

-- Профиль ребёнка
CREATE TABLE "ChildProfile" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "avatar" TEXT,
    "notes" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "streakCount" INTEGER NOT NULL DEFAULT 0,
    "streakFreezes" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChildProfile_parentId_idx" ON "ChildProfile"("parentId");

ALTER TABLE "ChildProfile" ADD CONSTRAINT "ChildProfile_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Согласия
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Consent_childId_type_key" ON "Consent"("childId", "type");
CREATE INDEX "Consent_parentId_idx" ON "Consent"("parentId");

ALTER TABLE "Consent" ADD CONSTRAINT "Consent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Фотографии ребёнка (закрытое хранилище)
CREATE TABLE "ChildPhoto" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChildPhoto_childId_idx" ON "ChildPhoto"("childId");

ALTER TABLE "ChildPhoto" ADD CONSTRAINT "ChildPhoto_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Учебная программа
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "iconName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subject_slug_key" ON "Subject"("slug");

CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");
CREATE INDEX "Course_subjectId_sortOrder_idx" ON "Course"("subjectId", "sortOrder");

ALTER TABLE "Course" ADD CONSTRAINT "Course_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseModule_courseId_sortOrder_idx" ON "CourseModule"("courseId", "sortOrder");

ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 25,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "content" JSONB,
    "aiBudgetUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Topic_moduleId_sortOrder_idx" ON "Topic"("moduleId", "sortOrder");

ALTER TABLE "Topic" ADD CONSTRAINT "Topic_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SkillDef" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillDef_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SkillDef_slug_key" ON "SkillDef"("slug");
CREATE INDEX "SkillDef_subjectId_idx" ON "SkillDef"("subjectId");

ALTER TABLE "SkillDef" ADD CONSTRAINT "SkillDef_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TopicSkill" (
    "topicId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "TopicSkill_pkey" PRIMARY KEY ("topicId", "skillId")
);

ALTER TABLE "TopicSkill" ADD CONSTRAINT "TopicSkill_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopicSkill" ADD CONSTRAINT "TopicSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "SkillDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
