-- P8.1: user-owned media library and library-generation projects.

ALTER TABLE "Project" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'service';

ALTER TABLE "MediaAsset" ADD COLUMN "ownerUserId" TEXT;

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Project_userId_mode_idx" ON "Project"("userId", "mode");
CREATE INDEX "MediaAsset_ownerUserId_kind_idx" ON "MediaAsset"("ownerUserId", "kind");
