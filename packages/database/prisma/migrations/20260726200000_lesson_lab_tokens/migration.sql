-- Изолированный бюджет нейролаборатории на урок (начисляется один раз при старте).
ALTER TABLE "Lesson" ADD COLUMN "labTokensGranted" INTEGER;
ALTER TABLE "Lesson" ADD COLUMN "labTokensSpent" INTEGER NOT NULL DEFAULT 0;
