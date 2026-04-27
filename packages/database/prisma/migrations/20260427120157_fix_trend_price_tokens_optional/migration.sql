/*
  Warnings:

  - Made the column `priceTokens` on table `Service` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Service" ALTER COLUMN "priceTokens" SET NOT NULL;

-- AlterTable
ALTER TABLE "Trend" ALTER COLUMN "priceTokens" DROP NOT NULL;
