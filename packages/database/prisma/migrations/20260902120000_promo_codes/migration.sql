-- Промокоды на пополнение баланса.
CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENT', 'FIXED');

CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "discountType" "PromoDiscountType" NOT NULL DEFAULT 'PERCENT',
    "discountValue" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX "PromoCode_isActive_idx" ON "PromoCode"("isActive");

CREATE TABLE "PromoCodeUse" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "discountRub" INTEGER NOT NULL,
    "amountRub" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeUse_pkey" PRIMARY KEY ("id")
);

-- Одна оплата — одно использование: повторный webhook не удвоит счётчик.
CREATE UNIQUE INDEX "PromoCodeUse_paymentId_key" ON "PromoCodeUse"("paymentId");
CREATE INDEX "PromoCodeUse_promoCodeId_createdAt_idx" ON "PromoCodeUse"("promoCodeId", "createdAt");

ALTER TABLE "PromoCodeUse" ADD CONSTRAINT "PromoCodeUse_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeUse" ADD CONSTRAINT "PromoCodeUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
