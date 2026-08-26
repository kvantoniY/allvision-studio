-- G6: поздравления на заказ. Тип заказа настраивается в админке целиком:
-- поля брифа, вилка цен и письма по статусам — без изменений в коде.

DO $$ BEGIN
  CREATE TYPE "CustomOrderStatus" AS ENUM ('NEW', 'QUOTED', 'PAID', 'IN_PROGRESS', 'DELIVERED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "OrderTypeDef" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDesc" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverImage" TEXT,
    "previewVideo" TEXT,
    "briefFields" JSONB NOT NULL,
    "priceFromCoins" INTEGER NOT NULL,
    "priceToCoins" INTEGER NOT NULL,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 5,
    "emailTemplates" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderTypeDef_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderTypeDef_slug_key" ON "OrderTypeDef"("slug");
CREATE INDEX IF NOT EXISTS "OrderTypeDef_isActive_sortOrder_idx" ON "OrderTypeDef"("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "CustomOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderTypeId" TEXT,
    "typeTitle" TEXT NOT NULL,
    "status" "CustomOrderStatus" NOT NULL DEFAULT 'NEW',
    "brief" JSONB NOT NULL,
    "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "quotedPriceCoins" INTEGER,
    "adminNote" TEXT,
    "resultUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomOrder_userId_updatedAt_idx" ON "CustomOrder"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "CustomOrder_status_updatedAt_idx" ON "CustomOrder"("status", "updatedAt");

CREATE TABLE IF NOT EXISTS "CustomOrderMessage" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "authorId" TEXT,
    "fromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomOrderMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomOrderMessage_orderId_createdAt_idx" ON "CustomOrderMessage"("orderId", "createdAt");

ALTER TABLE "CustomOrder" ADD CONSTRAINT "CustomOrder_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomOrder" ADD CONSTRAINT "CustomOrder_orderTypeId_fkey"
  FOREIGN KEY ("orderTypeId") REFERENCES "OrderTypeDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomOrderMessage" ADD CONSTRAINT "CustomOrderMessage_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "CustomOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomOrderMessage" ADD CONSTRAINT "CustomOrderMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
