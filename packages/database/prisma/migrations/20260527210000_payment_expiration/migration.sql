ALTER TABLE "Payment" ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "Payment"
SET "expiresAt" = "createdAt" + INTERVAL '15 minutes'
WHERE "status" = 'PENDING'
  AND "expiresAt" IS NULL;

CREATE INDEX "Payment_status_expiresAt_idx" ON "Payment"("status", "expiresAt");
