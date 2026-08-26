-- G4: ролики, которые пользователь собирает в редакторе.
-- Вся раскладка хранится одним JSON — той же схемой пользуются предпросмотр и рендер.
CREATE TABLE IF NOT EXISTS "VideoProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "timeline" JSONB NOT NULL,
    "lastExportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VideoProject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VideoProject_userId_updatedAt_idx" ON "VideoProject"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "VideoProject_deletedAt_idx" ON "VideoProject"("deletedAt");

ALTER TABLE "VideoProject"
  ADD CONSTRAINT "VideoProject_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
