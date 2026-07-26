-- Профиль преподавателя: фото (грузит только админ), ручное число занятий, назначенные курсы.
ALTER TABLE "TeacherProfile" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "TeacherProfile" ADD COLUMN "lessonsManual" INTEGER;
ALTER TABLE "TeacherProfile" ADD COLUMN "courseIds" TEXT[] NOT NULL DEFAULT '{}';
