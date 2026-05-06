-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceCategory" ADD VALUE 'NOSTALGIA';
ALTER TYPE "ServiceCategory" ADD VALUE 'TRENDS_MEMES';
ALTER TYPE "ServiceCategory" ADD VALUE 'KIDS_HEROES';
ALTER TYPE "ServiceCategory" ADD VALUE 'SPECIAL_OCCASIONS';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "pipelineSnapshot" JSONB,
ADD COLUMN     "selectedTier" TEXT,
ADD COLUMN     "stepProgress" JSONB,
ADD COLUMN     "userInputs" JSONB;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pipelineConfig" JSONB,
ADD COLUMN     "previewImage" TEXT,
ADD COLUMN     "previewVideo" TEXT,
ADD COLUMN     "priceCoinsPro" INTEGER,
ADD COLUMN     "priceCoinsStandard" INTEGER,
ADD COLUMN     "userInputForm" JSONB;
