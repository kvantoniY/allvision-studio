-- A4: запись и деньги — преподаватели, слоты, уроки, кредиты занятий, выплаты

ALTER TYPE "PaymentPurpose" ADD VALUE IF NOT EXISTS 'LESSON_PACKAGE';

CREATE TYPE "LessonStatus" AS ENUM ('BOOKED', 'AWAITING_PREP', 'GENERATING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'REPORT_SENT', 'CANCELLED_PARENT', 'CANCELLED_TEACHER', 'NO_SHOW');
CREATE TYPE "EarningStatus" AS ENUM ('PENDING', 'AVAILABLE', 'PAID', 'REJECTED');

CREATE TABLE "TeacherProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "subjects" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeacherProfile_userId_key" ON "TeacherProfile"("userId");
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TeacherSlot" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 25,
    "isBooked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TeacherSlot_teacherId_startsAt_idx" ON "TeacherSlot"("teacherId", "startsAt");
CREATE INDEX "TeacherSlot_startsAt_isBooked_idx" ON "TeacherSlot"("startsAt", "isBooked");
ALTER TABLE "TeacherSlot" ADD CONSTRAINT "TeacherSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LessonCredit" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "paymentId" TEXT,
    "lessonId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonCredit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonCredit_parentId_durationMin_consumedAt_idx" ON "LessonCredit"("parentId", "durationMin", "consumedAt");
ALTER TABLE "LessonCredit" ADD CONSTRAINT "LessonCredit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "topicId" TEXT,
    "durationMin" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'BOOKED',
    "priceRub" INTEGER NOT NULL,
    "creditId" TEXT,
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Lesson_slotId_key" ON "Lesson"("slotId");
CREATE INDEX "Lesson_childId_startsAt_idx" ON "Lesson"("childId", "startsAt");
CREATE INDEX "Lesson_teacherId_startsAt_idx" ON "Lesson"("teacherId", "startsAt");
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "TeacherSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TeacherEarning" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "amountRub" INTEGER NOT NULL,
    "status" "EarningStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherEarning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeacherEarning_lessonId_key" ON "TeacherEarning"("lessonId");
CREATE INDEX "TeacherEarning_teacherId_status_idx" ON "TeacherEarning"("teacherId", "status");
ALTER TABLE "TeacherEarning" ADD CONSTRAINT "TeacherEarning_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherEarning" ADD CONSTRAINT "TeacherEarning_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
