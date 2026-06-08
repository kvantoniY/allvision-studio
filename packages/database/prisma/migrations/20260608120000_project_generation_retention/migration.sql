ALTER TABLE "Project" ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "Project"
SET "expiresAt" = COALESCE("completedAt", "createdAt") + interval '3 days'
WHERE "mode" <> 'library-generation';

CREATE INDEX "Project_expiresAt_idx" ON "Project"("expiresAt");
