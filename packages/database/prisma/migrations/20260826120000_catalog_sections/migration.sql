-- G1: секции витрины (вкладки), теги поводов, кураторский порядок «Популярного»,
-- заявки с заглушек будущих разделов.

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "featuredOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "occasionTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ServiceCategoryDef" ADD COLUMN IF NOT EXISTS "section" TEXT NOT NULL DEFAULT 'services';

-- Кураторский порядок стартует от текущего sortOrder, чтобы вкладка «Популярное»
-- не выглядела перетасованной сразу после деплоя.
UPDATE "Service" SET "featuredOrder" = "sortOrder" WHERE "featuredOrder" = 0;

CREATE TABLE IF NOT EXISTS "WaitlistLead" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "comment" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WaitlistLead_topic_createdAt_idx" ON "WaitlistLead"("topic", "createdAt");
