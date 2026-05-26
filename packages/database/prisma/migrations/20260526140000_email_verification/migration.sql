ALTER TABLE "User"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "emailVerifyToken" TEXT,
  ADD COLUMN "emailVerifyExpiresAt" TIMESTAMP(3);
