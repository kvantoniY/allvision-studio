-- Add group code to MediaAsset for grouping assets (e.g. trend dances, trend memes).
ALTER TABLE "MediaAsset" ADD COLUMN "groupCode" TEXT;
CREATE INDEX "MediaAsset_kind_groupCode_idx" ON "MediaAsset"("kind", "groupCode");
