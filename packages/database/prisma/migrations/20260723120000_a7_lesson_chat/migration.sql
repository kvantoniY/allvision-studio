-- A7: чат живого урока

CREATE TABLE "LessonChatMessage" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonChatMessage_lessonId_createdAt_idx" ON "LessonChatMessage"("lessonId", "createdAt");
ALTER TABLE "LessonChatMessage" ADD CONSTRAINT "LessonChatMessage_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
