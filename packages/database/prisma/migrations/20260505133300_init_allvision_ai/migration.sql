-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AvatarType" AS ENUM ('HUMAN', 'PET', 'OBJECT', 'OTHER');

-- CreateEnum
CREATE TYPE "AvatarStatus" AS ENUM ('PROCESSING', 'READY', 'REJECTED');

-- CreateEnum
CREATE TYPE "VoiceSourceType" AS ENUM ('UPLOADED', 'CLONED', 'PRESET');

-- CreateEnum
CREATE TYPE "VoiceStatus" AS ENUM ('PROCESSING', 'READY', 'REJECTED');

-- CreateEnum
CREATE TYPE "GenerationKind" AS ENUM ('TEXT', 'AUDIO', 'IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PresetCategory" AS ENUM ('PHOTO_RESTORE', 'PHOTO_ANIMATE', 'PHOTO_ENHANCE_AND_ANIMATE', 'TREND_DANCE', 'TREND_OTHER', 'AUDIO_PRESET', 'TEXT_PRESET', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "coinBalance" INTEGER NOT NULL DEFAULT 25,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "freeAvatarUsed" BOOLEAN NOT NULL DEFAULT false,
    "freeVoiceUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AvatarType" NOT NULL,
    "referenceImages" TEXT[],
    "primaryImageId" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" "AvatarStatus" NOT NULL DEFAULT 'PROCESSING',
    "nsfwChecked" BOOLEAN NOT NULL DEFAULT false,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voice" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "sourceType" "VoiceSourceType" NOT NULL,
    "sourceAudio" TEXT,
    "providerVoiceId" TEXT,
    "linkedAvatarId" TEXT,
    "status" "VoiceStatus" NOT NULL DEFAULT 'PROCESSING',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "previewAudio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "referenceImages" TEXT[],
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Generation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "GenerationKind" NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT,
    "inputImages" TEXT[],
    "inputVideo" TEXT,
    "inputAudio" TEXT,
    "avatarIds" TEXT[],
    "sceneId" TEXT,
    "voiceId" TEXT,
    "aiProvider" TEXT NOT NULL,
    "aiModel" TEXT NOT NULL,
    "aiConfig" JSONB,
    "durationSeconds" INTEGER,
    "aspectRatio" TEXT,
    "style" TEXT,
    "resultText" TEXT,
    "resultImage" TEXT,
    "resultVideo" TEXT,
    "resultAudio" TEXT,
    "resultThumbnail" TEXT,
    "coinsCost" INTEGER NOT NULL,
    "parentGenerationId" TEXT,
    "watermarkRemoved" BOOLEAN NOT NULL DEFAULT false,
    "threadId" TEXT,
    "aiProviderJobId" TEXT,
    "aiProviderLogs" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresetRecipe" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDesc" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "PresetCategory" NOT NULL,
    "kind" "GenerationKind" NOT NULL,
    "mode" TEXT NOT NULL,
    "promptTemplate" TEXT,
    "promptHint" TEXT,
    "needsInput" BOOLEAN NOT NULL DEFAULT true,
    "acceptedInput" TEXT,
    "aiProvider" TEXT NOT NULL,
    "aiModel" TEXT NOT NULL,
    "aiConfig" JSONB,
    "coinsCost" INTEGER NOT NULL,
    "previewImage" TEXT NOT NULL,
    "previewVideo" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresetRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "CoinTransaction_userId_createdAt_idx" ON "CoinTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatThread_userId_updatedAt_idx" ON "ChatThread"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Generation_userId_kind_createdAt_idx" ON "Generation"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Generation_threadId_createdAt_idx" ON "Generation"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PresetRecipe_slug_key" ON "PresetRecipe"("slug");

-- AddForeignKey
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avatar" ADD CONSTRAINT "Avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voice" ADD CONSTRAINT "Voice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

