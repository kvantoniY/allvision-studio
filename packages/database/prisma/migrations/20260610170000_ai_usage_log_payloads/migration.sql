ALTER TABLE "AIUsageLog"
  ADD COLUMN "requestPayload" JSONB,
  ADD COLUMN "responsePayload" JSONB;
