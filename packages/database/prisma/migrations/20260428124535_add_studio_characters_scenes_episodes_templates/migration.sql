-- CreateEnum
CREATE TYPE "CharacterType" AS ENUM ('HUMAN', 'PET', 'GROUP', 'MASCOT');

-- CreateEnum
CREATE TYPE "CharacterGender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "CharacterStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'REJECTED', 'PAYMENT_PENDING');

-- CreateEnum
CREATE TYPE "EpisodeStatus" AS ENUM ('PENDING', 'PROCESSING_IMAGE', 'PROCESSING_VIDEO', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AbuseReason" AS ENUM ('UNCONSENTED_FACE', 'CELEBRITY', 'MINOR', 'HARASSMENT', 'DEFAMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('NEW', 'REVIEWING', 'RESOLVED_REMOVED', 'RESOLVED_NO_ACTION', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "freeCharacterUsed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CharacterType" NOT NULL,
    "gender" "CharacterGender",
    "ageGroup" TEXT,
    "description" TEXT,
    "referenceImages" TEXT[],
    "primaryImageId" INTEGER NOT NULL DEFAULT 0,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "nsfwChecked" BOOLEAN NOT NULL DEFAULT false,
    "status" "CharacterStatus" NOT NULL DEFAULT 'DRAFT',
    "episodesCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paymentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "referenceImages" TEXT[],
    "category" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paymentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "EpisodeStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "templateId" TEXT,
    "customScenario" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 5,
    "style" TEXT,
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "sceneId" TEXT,
    "resultImage" TEXT,
    "resultVideo" TEXT,
    "resultThumbnail" TEXT,
    "tokensCost" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "aiProviderJobId" TEXT,
    "aiProviderLogs" JSONB,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "watermarkRemoved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeCharacter" (
    "episodeId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "EpisodeCharacter_pkey" PRIMARY KEY ("episodeId","characterId")
);

-- CreateTable
CREATE TABLE "ScenarioTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDesc" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "previewVideo" TEXT NOT NULL,
    "previewImage" TEXT NOT NULL,
    "promptTemplate" TEXT NOT NULL,
    "characterRoles" JSONB NOT NULL,
    "needsScene" BOOLEAN NOT NULL DEFAULT false,
    "recommendedDuration" INTEGER NOT NULL DEFAULT 10,
    "defaultStyle" TEXT NOT NULL DEFAULT 'cinematic',
    "aiProvider" TEXT NOT NULL DEFAULT 'fal',
    "aiModel" TEXT NOT NULL,
    "aiConfig" JSONB NOT NULL,
    "priceTokens" INTEGER NOT NULL,
    "tags" TEXT[],
    "popularityScore" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbuseReport" (
    "id" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "reporterEmail" TEXT,
    "characterId" TEXT,
    "episodeId" TEXT,
    "reason" "AbuseReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'NEW',
    "adminNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbuseReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Character_paymentId_key" ON "Character"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_paymentId_key" ON "Scene"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioTemplate_slug_key" ON "ScenarioTemplate"("slug");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScenarioTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeCharacter" ADD CONSTRAINT "EpisodeCharacter_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeCharacter" ADD CONSTRAINT "EpisodeCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseReport" ADD CONSTRAINT "AbuseReport_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbuseReport" ADD CONSTRAINT "AbuseReport_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
