-- A5: панель генерации, общая/преподавательская и закрытая детская библиотеки

ALTER TABLE "MediaAsset"
  ADD COLUMN "generationModel" TEXT,
  ADD COLUMN "generationPrompt" TEXT,
  ADD COLUMN "generationCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "generationParams" JSONB;

CREATE TABLE "ChildAsset" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "createdById" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "generationModel" TEXT,
    "generationPrompt" TEXT,
    "generationCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "generationParams" JSONB,
    "sourceRefIds" TEXT[],
    "generationProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChildAsset_generationProjectId_key" ON "ChildAsset"("generationProjectId");
CREATE INDEX "ChildAsset_childId_kind_createdAt_idx" ON "ChildAsset"("childId", "kind", "createdAt");
CREATE INDEX "ChildAsset_createdById_idx" ON "ChildAsset"("createdById");

ALTER TABLE "ChildAsset" ADD CONSTRAINT "ChildAsset_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildAsset" ADD CONSTRAINT "ChildAsset_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
