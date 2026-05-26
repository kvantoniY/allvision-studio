ALTER TABLE "TokenPackage"
  ADD COLUMN "subtitle" TEXT,
  ADD COLUMN "originalPriceRub" INTEGER,
  ADD COLUMN "badgeText" TEXT,
  ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
