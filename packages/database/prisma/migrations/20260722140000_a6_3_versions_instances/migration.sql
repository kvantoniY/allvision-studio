-- A6.3: версии шаблонов уроков и экземпляры урока

ALTER TABLE "LessonTemplate" ADD COLUMN "latestVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "LessonTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "scene" JSONB NOT NULL,
    "publishedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LessonTemplateVersion_templateId_version_key" ON "LessonTemplateVersion"("templateId", "version");
CREATE INDEX "LessonTemplateVersion_templateId_idx" ON "LessonTemplateVersion"("templateId");
ALTER TABLE "LessonTemplateVersion" ADD CONSTRAINT "LessonTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LessonTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LessonInstance" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "overrides" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LessonInstance_lessonId_key" ON "LessonInstance"("lessonId");
CREATE INDEX "LessonInstance_templateVersionId_idx" ON "LessonInstance"("templateVersionId");
ALTER TABLE "LessonInstance" ADD CONSTRAINT "LessonInstance_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonInstance" ADD CONSTRAINT "LessonInstance_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "LessonTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
