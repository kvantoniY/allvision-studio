import crypto from 'node:crypto';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { uploadAcademyImage } from '../../middleware/upload';
import { getStorageProvider } from '../../providers';
import { HttpError } from '../../utils/http-error';

export const adminTeachersRouter = Router();
adminTeachersRouter.use(requireAuth, requireAdmin);

/** Профиль преподавателя создаётся лениво (у роли TEACHER). */
async function ensureProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true, email: true } });
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  let profile = await prisma.teacherProfile.findUnique({ where: { userId } });
  if (!profile) profile = await prisma.teacherProfile.create({ data: { userId, subjects: [] } });
  return { user, profile };
}

async function completedLessons(teacherId: string) {
  return prisma.lesson.count({ where: { teacherId, status: { in: ['COMPLETED', 'REPORT_SENT'] } } });
}

adminTeachersRouter.get('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user, profile } = await ensureProfile(req.params.userId);
    const courses = await prisma.course.findMany({
      where: { isActive: true },
      orderBy: [{ subject: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      select: { id: true, title: true, subject: { select: { title: true } } },
    });
    res.json({
      userId: user.id,
      name: user.name ?? user.email,
      email: user.email,
      bio: profile.bio,
      photoUrl: profile.photoUrl,
      lessonsManual: profile.lessonsManual,
      lessonsCompleted: await completedLessons(profile.id),
      courseIds: profile.courseIds,
      isActive: profile.isActive,
      courses: courses.map((c) => ({ id: c.id, title: c.title, subjectTitle: c.subject.title })),
    });
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  bio: z.string().max(4000).nullable().optional(),
  lessonsManual: z.number().int().min(0).max(100000).nullable().optional(),
  courseIds: z.array(z.string()).max(500).optional(),
  isActive: z.boolean().optional(),
});

adminTeachersRouter.patch('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = patchSchema.parse(req.body ?? {});
    const { profile } = await ensureProfile(req.params.userId);
    await prisma.teacherProfile.update({
      where: { id: profile.id },
      data: {
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.lessonsManual !== undefined ? { lessonsManual: data.lessonsManual } : {}),
        ...(data.courseIds !== undefined ? { courseIds: data.courseIds } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Фото профиля загружает ТОЛЬКО админ (защита от неподобающего контента от сотрудника).
adminTeachersRouter.post('/:userId/photo', uploadAcademyImage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) throw new HttpError(400, 'FILE_REQUIRED', 'Прикрепите фото');
    const { profile } = await ensureProfile(req.params.userId);
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const key = path.posix.join('academy', 'teacher-photos', `${crypto.randomUUID()}.${ext}`);
    const uploaded = await getStorageProvider().upload({ key, body: file.buffer, contentType: file.mimetype });
    await prisma.teacherProfile.update({ where: { id: profile.id }, data: { photoUrl: uploaded.url } });
    res.json({ ok: true, photoUrl: uploaded.url });
  } catch (err) {
    next(err);
  }
});
