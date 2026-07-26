-- Рабочая заметка преподавателя по ученику.
CREATE TABLE "TeacherStudentNote" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeacherStudentNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeacherStudentNote_teacherId_childId_key" ON "TeacherStudentNote"("teacherId", "childId");
CREATE INDEX "TeacherStudentNote_teacherId_idx" ON "TeacherStudentNote"("teacherId");
ALTER TABLE "TeacherStudentNote" ADD CONSTRAINT "TeacherStudentNote_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherStudentNote" ADD CONSTRAINT "TeacherStudentNote_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
