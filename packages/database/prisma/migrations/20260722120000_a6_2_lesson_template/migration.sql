-- A6.2: конструктор сцен — шаблон урока с черновиком сцены

CREATE TABLE "LessonTemplate" (
    "id" TEXT NOT NULL,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scene" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonTemplate_topicId_idx" ON "LessonTemplate"("topicId");
CREATE INDEX "LessonTemplate_createdById_idx" ON "LessonTemplate"("createdById");
