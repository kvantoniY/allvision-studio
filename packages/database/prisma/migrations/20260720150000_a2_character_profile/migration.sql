-- A2: AI-профиль внешности ребёнка

CREATE TYPE "CharacterProfileStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY', 'APPROVED', 'FAILED');

CREATE TABLE "CharacterProfile" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "status" "CharacterProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CharacterProfile_childId_key" ON "CharacterProfile"("childId");

ALTER TABLE "CharacterProfile" ADD CONSTRAINT "CharacterProfile_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CharacterReference" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "width" INTEGER,
    "height" INTEGER,
    "promptUsed" TEXT,
    "model" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterReference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CharacterReference_profileId_kind_idx" ON "CharacterReference"("profileId", "kind");

ALTER TABLE "CharacterReference" ADD CONSTRAINT "CharacterReference_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CharacterProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
