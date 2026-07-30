import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@allvision/database';
import {
  bookLessonSchema,
  buildLessonPackages,
  cancelLessonSchema,
  createSlotSchema,
  hasAllPhotoConsents,
  LESSON_BASE_PRICE_RUB,
  levelProgressFromXp,
  purchaseLessonPackageSchema,
  resolveCancellation,
  teacherEarningRub,
  type AvailableTeacherDto,
  type LessonStatusValue,
} from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { requireParent, requireRole } from '../middleware/require-role';
import { HttpError } from '../utils/http-error';
import { createLessonPackagePayment } from '../services/payment-service';
import {
  consumeCredit,
  ensureTeacherProfile,
  getLessonBalance,
  lessonInclude,
  toLessonDto,
  topicTitles,
} from '../services/academy-booking-service';
import { awardLessonCompletion } from '../services/academy-gamification-service';
import { completeLessonTopic } from '../services/academy-lesson-topic-service';
import { lessonLabState } from '../services/academy-lesson-lab-service';
import { createFreeChatProject } from '../services/free-chat-generation';
import {
  buildTeacherStudents,
  buildTeacherStudentDetail,
  saveTeacherStudentNote,
  teacherTaughtChild,
} from '../services/academy-teacher-students-service';
import { createLessonVideoToken } from '../services/lesson-video-service';
import { addLessonSystemMessage } from '../services/academy-operations-service';

export const academyBookingRouter = Router();

// === Абонементы и баланс ===

academyBookingRouter.get('/packages', requireAuth, (_req: Request, res: Response) => {
  res.json({ packages: buildLessonPackages() });
});

academyBookingRouter.post('/packages/purchase', requireAuth, requireParent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { durationMin, count } = purchaseLessonPackageSchema.parse(req.body);
    const result = await createLessonPackagePayment(req.user!.id, durationMin, count);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

academyBookingRouter.get('/balance', requireAuth, requireParent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ balance: await getLessonBalance(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

// === Преподаватели и свободные слоты (для записи) ===

academyBookingRouter.get('/teachers', requireAuth, requireParent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subject = typeof req.query.subject === 'string' ? req.query.subject : undefined;
    // Окно записи — ближайшие 90 дней: календарю на фронте нужны все свободные слоты
    // периода, а не первые 30 подряд (иначе дальние даты выглядят пустыми).
    const now = new Date();
    const horizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const freeSlotWhere = { isBooked: false, startsAt: { gt: now, lt: horizon } };
    const teachers = await prisma.teacherProfile.findMany({
      where: {
        isActive: true,
        ...(subject ? { subjects: { has: subject } } : {}),
        slots: { some: freeSlotWhere },
      },
      include: {
        user: { select: { name: true, email: true } },
        slots: {
          where: freeSlotWhere,
          orderBy: { startsAt: 'asc' },
          take: 500,
        },
      },
    });
    // Курсы для выбора при записи: у преподавателя courseIds (пусто = все активные курсы).
    const allCourses = await prisma.course.findMany({
      where: { isActive: true },
      orderBy: [{ subject: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      select: { id: true, title: true, subject: { select: { title: true } } },
    });
    const courseById = new Map(allCourses.map((c) => [c.id, { id: c.id, title: c.title, subjectTitle: c.subject.title }]));
    const completedByTeacher = new Map(
      (await prisma.lesson.groupBy({ by: ['teacherId'], where: { status: { in: ['COMPLETED', 'REPORT_SENT'] } }, _count: { _all: true } }))
        .map((r) => [r.teacherId, r._count._all]),
    );

    const dto: AvailableTeacherDto[] = teachers.map((t) => {
      const courses = t.courseIds.length > 0
        ? t.courseIds.map((id) => courseById.get(id)).filter((c): c is { id: string; title: string; subjectTitle: string } => Boolean(c))
        : allCourses.map((c) => ({ id: c.id, title: c.title, subjectTitle: c.subject.title }));
      return {
        teacherId: t.id,
        name: t.user.name ?? t.user.email,
        bio: t.bio,
        photoUrl: t.photoUrl,
        lessonsCount: t.lessonsManual ?? completedByTeacher.get(t.id) ?? 0,
        subjects: t.subjects,
        courses,
        slots: t.slots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), durationMin: s.durationMin, isBooked: s.isBooked })),
      };
    });
    res.json({ teachers: dto });
  } catch (err) {
    next(err);
  }
});

// === Публичный профиль преподавателя (для карточки занятия) ===
academyBookingRouter.get('/teachers/:teacherId/profile', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await prisma.teacherProfile.findUnique({
      where: { id: req.params.teacherId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!t) throw new HttpError(404, 'TEACHER_NOT_FOUND', 'Преподаватель не найден');
    const completed = await prisma.lesson.count({ where: { teacherId: t.id, status: { in: ['COMPLETED', 'REPORT_SENT'] } } });
    res.json({
      teacherId: t.id,
      name: t.user.name ?? t.user.email,
      bio: t.bio,
      photoUrl: t.photoUrl,
      lessonsCount: t.lessonsManual ?? completed,
      subjects: t.subjects,
    });
  } catch (err) {
    next(err);
  }
});

// === Бронирование ===

academyBookingRouter.post('/booking', requireAuth, requireParent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = bookLessonSchema.parse(req.body);
    const child = await prisma.childProfile.findFirst({
      where: { id: data.childId, parentId: req.user!.id, deletedAt: null },
      include: { consents: true, characterProfile: { select: { status: true } } },
    });
    if (!child) throw new HttpError(404, 'CHILD_NOT_FOUND', 'Ребёнок не найден');

    // Урок строится вокруг AI-персонажа ребёнка: без согласий и утверждённого
    // персонажа преподаватель не сможет подготовить сцены.
    const consentsComplete = hasAllPhotoConsents(
      child.consents.map((c) => ({ type: c.type, version: c.version, revokedAt: c.revokedAt })),
    );
    if (!consentsComplete) {
      throw new HttpError(403, 'CONSENTS_REQUIRED', 'Примите все согласия в профиле ребёнка перед записью на урок');
    }
    if (child.characterProfile?.status !== 'APPROVED') {
      throw new HttpError(403, 'CHARACTER_REQUIRED', 'Создайте и утвердите AI-персонажа ребёнка перед записью на урок');
    }
    const slot = await prisma.teacherSlot.findUnique({ where: { id: data.slotId } });
    if (!slot || slot.isBooked || slot.startsAt <= new Date()) {
      throw new HttpError(409, 'SLOT_UNAVAILABLE', 'Слот уже занят или недоступен');
    }

    const lesson = await prisma.$transaction(async (tx) => {
      // Атомарно занимаем слот: если кто-то успел раньше — count=0.
      const claim = await tx.teacherSlot.updateMany({ where: { id: slot.id, isBooked: false }, data: { isBooked: true } });
      if (claim.count === 0) throw new HttpError(409, 'SLOT_UNAVAILABLE', 'Слот только что заняли');

      const created = await tx.lesson.create({
        data: {
          childId: child.id,
          teacherId: slot.teacherId,
          slotId: slot.id,
          topicId: data.topicId ?? null,
          durationMin: slot.durationMin,
          startsAt: slot.startsAt,
          status: 'BOOKED',
          priceRub: LESSON_BASE_PRICE_RUB[slot.durationMin as 25 | 45] ?? 0,
        },
      });

      // Родитель выбрал курс при записи — сразу оформляем запись на программу, иначе
      // преподаватель на подготовке не увидит рекомендованную тему (раньше это была
      // отдельная ручная операция в «Семье», о которой родитель не догадывался).
      if (data.courseId) {
        const course = await tx.course.findFirst({ where: { id: data.courseId, isActive: true }, select: { id: true } });
        if (course) {
          const existing = await tx.enrollment.findFirst({ where: { childId: child.id, courseId: course.id } });
          if (!existing) {
            await tx.enrollment.create({ data: { childId: child.id, courseId: course.id, status: 'ACTIVE' } });
          } else if (existing.status === 'PAUSED') {
            await tx.enrollment.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } });
          }
        }
      }

      const creditId = await consumeCredit(tx, req.user!.id, slot.durationMin, created.id);
      if (!creditId) {
        throw new HttpError(402, 'INSUFFICIENT_CREDITS', `Нет оплаченных занятий на ${slot.durationMin} мин — купите абонемент`);
      }
      await tx.lesson.update({ where: { id: created.id }, data: { creditId } });

      // Начисление преподавателю (ожидает подтверждения до завершения урока).
      await tx.teacherEarning.create({
        data: { lessonId: created.id, teacherId: slot.teacherId, amountRub: teacherEarningRub(created.priceRub), status: 'PENDING' },
      });
      await addLessonSystemMessage(tx, {
        parentId: req.user!.id,
        teacherId: slot.teacherId,
        childId: child.id,
        body: `Занятие забронировано на ${slot.startsAt.toLocaleString('ru-RU')}.`,
      });
      return created;
    });

    res.status(201).json({ lessonId: lesson.id });
  } catch (err) {
    next(err);
  }
});

// === Уроки родителя ===

academyBookingRouter.get('/lessons', requireAuth, requireParent, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lessons = await prisma.lesson.findMany({
      where: { child: { parentId: req.user!.id } },
      include: lessonInclude,
      orderBy: { startsAt: 'desc' },
      take: 100,
    });
    const titles = await topicTitles(lessons.map((l) => l.topicId ?? ''));
    res.json({ lessons: lessons.map((l) => toLessonDto(l, titles)) });
  } catch (err) {
    next(err);
  }
});

async function loadLessonForActor(lessonId: string, userId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { child: { select: { parentId: true } }, teacher: { select: { userId: true } } },
  });
  if (!lesson) throw new HttpError(404, 'LESSON_NOT_FOUND', 'Урок не найден');
  const isParent = lesson.child.parentId === userId;
  const isTeacher = lesson.teacher.userId === userId;
  if (!isParent && !isTeacher) throw new HttpError(403, 'FORBIDDEN', 'Нет доступа к уроку');
  return { lesson, by: (isTeacher ? 'teacher' : 'parent') as 'teacher' | 'parent' };
}

// === Токен видеосвязи урока (A8): участник урока получает доступ в свою комнату LiveKit ===
academyBookingRouter.get('/lessons/:id/video-token', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isAdmin = req.user!.role === 'ADMIN';
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: {
        child: { select: { parentId: true, name: true } },
        teacher: { select: { userId: true, user: { select: { name: true, email: true } } } },
      },
    });
    if (!lesson) throw new HttpError(404, 'LESSON_NOT_FOUND', 'Урок не найден');

    const isTeacher = isAdmin || lesson.teacher.userId === req.user!.id;
    const isParent = lesson.child.parentId === req.user!.id;
    if (!isTeacher && !isParent) throw new HttpError(403, 'FORBIDDEN', 'Нет доступа к уроку');

    const result = await createLessonVideoToken({
      lessonId: lesson.id,
      userId: req.user!.id,
      role: isTeacher ? 'teacher' : 'student',
      displayName: isTeacher ? (lesson.teacher.user.name ?? lesson.teacher.user.email) : lesson.child.name,
    });
    // Видеосвязь не настроена — это не ошибка: комната урока работает и без неё.
    if (!result) return res.json({ enabled: false });
    res.json({ enabled: true, ...result });
  } catch (err) {
    next(err);
  }
});

academyBookingRouter.post('/lessons/:id/cancel', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = cancelLessonSchema.parse(req.body ?? {});
    const { lesson, by } = await loadLessonForActor(req.params.id, req.user!.id);
    const outcome = resolveCancellation({ by, status: lesson.status as LessonStatusValue, startsAt: lesson.startsAt });
    if (!outcome.allowed) throw new HttpError(400, 'CANCEL_NOT_ALLOWED', outcome.reason ?? 'Отмена недоступна');

    await prisma.$transaction(async (tx) => {
      await tx.lesson.update({
        where: { id: lesson.id },
        data: {
          status: by === 'teacher' ? 'CANCELLED_TEACHER' : 'CANCELLED_PARENT',
          cancelledBy: by,
          cancelReason: reason ?? null,
        },
      });
      await tx.teacherSlot.update({ where: { id: lesson.slotId }, data: { isBooked: false } });
      await tx.teacherEarning.updateMany({ where: { lessonId: lesson.id }, data: { status: 'REJECTED' } });
      if (outcome.refundCredit) {
        await tx.lessonCredit.create({
          data: { parentId: lesson.child.parentId, durationMin: lesson.durationMin, source: 'refund', lessonId: lesson.id },
        });
      }
      await addLessonSystemMessage(tx, {
        parentId: lesson.child.parentId,
        teacherId: lesson.teacherId,
        childId: lesson.childId,
        body: by === 'teacher' ? 'Преподаватель отменил занятие.' : 'Родитель отменил занятие.',
      });
    });
    res.json({ ok: true, refunded: outcome.refundCredit });
  } catch (err) {
    next(err);
  }
});

// === Перенос урока на другое время (преподаватель или родитель) ===
const rescheduleSchema = z.object({ startsAt: z.string().datetime() });
// Переносить можно только до начала занятия и до его завершения/отмены.
const RESCHEDULABLE = new Set(['BOOKED', 'AWAITING_PREP', 'GENERATING', 'READY']);

academyBookingRouter.post('/lessons/:id/reschedule', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startsAt } = rescheduleSchema.parse(req.body ?? {});
    const nextStart = new Date(startsAt);
    if (Number.isNaN(nextStart.getTime()) || nextStart <= new Date()) {
      throw new HttpError(400, 'RESCHEDULE_IN_PAST', 'Новое время должно быть в будущем');
    }
    const { lesson, by } = await loadLessonForActor(req.params.id, req.user!.id);
    if (!RESCHEDULABLE.has(lesson.status)) {
      throw new HttpError(400, 'RESCHEDULE_NOT_ALLOWED', 'Этот урок уже нельзя перенести');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Освобождаем старый слот и создаём новый занятый слот у того же преподавателя.
      await tx.teacherSlot.update({ where: { id: lesson.slotId }, data: { isBooked: false } });
      const newSlot = await tx.teacherSlot.create({
        data: { teacherId: lesson.teacherId, startsAt: nextStart, durationMin: lesson.durationMin, isBooked: true },
      });
      const result = await tx.lesson.update({
        where: { id: lesson.id },
        data: { slotId: newSlot.id, startsAt: nextStart },
      });
      await addLessonSystemMessage(tx, {
        parentId: lesson.child.parentId,
        teacherId: lesson.teacherId,
        childId: lesson.childId,
        body: `${by === 'teacher' ? 'Преподаватель' : 'Родитель'} перенёс занятие на ${nextStart.toLocaleString('ru-RU')}.`,
      });
      return result;
    });
    res.json({ ok: true, startsAt: updated.startsAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

// === Ссылка на видеозвонок (Яндекс Телемост) — учитель ставит вручную ===
const meetingLinkSchema = z.object({ url: z.string().trim().max(2000) });

academyBookingRouter.post('/lessons/:id/meeting-link', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = meetingLinkSchema.parse(req.body ?? {});
    const trimmed = url.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      throw new HttpError(400, 'INVALID_MEETING_URL', 'Ссылка должна начинаться с http:// или https://');
    }
    const { lesson, by } = await loadLessonForActor(req.params.id, req.user!.id);
    if (by !== 'teacher') throw new HttpError(403, 'FORBIDDEN', 'Ссылку добавляет преподаватель');

    await prisma.$transaction(async (tx) => {
      await tx.lesson.update({ where: { id: lesson.id }, data: { meetingUrl: trimmed || null } });
      if (trimmed) {
        await addLessonSystemMessage(tx, {
          parentId: lesson.child.parentId,
          teacherId: lesson.teacherId,
          childId: lesson.childId,
          body: 'Преподаватель добавил ссылку на видеозвонок к уроку.',
        });
      }
    });
    res.json({ ok: true, meetingUrl: trimmed || null });
  } catch (err) {
    next(err);
  }
});

// === Обзор ребёнка в уроке: прогресс уровня + достижения этого урока ===
academyBookingRouter.get('/lessons/:id/child-overview', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lesson } = await loadLessonForActor(req.params.id, req.user!.id);
    const child = await prisma.childProfile.findUnique({
      where: { id: lesson.childId },
      select: { name: true, avatar: true, xp: true, level: true, streakCount: true },
    });
    if (!child) throw new HttpError(404, 'CHILD_NOT_FOUND', 'Ребёнок не найден');
    const achievements = await prisma.childAchievement.findMany({
      where: { childId: lesson.childId, sourceLessonId: lesson.id },
      include: { achievement: { select: { title: true, icon: true } } },
    });
    const progress = levelProgressFromXp(child.xp);
    // Сколько опыта принёс именно этот урок — для экрана результата ребёнку.
    const lessonXp = await prisma.xpEvent.aggregate({
      where: { childId: lesson.childId, lessonId: lesson.id },
      _sum: { amount: true },
    });
    res.json({
      childId: lesson.childId,
      lessonXp: lessonXp._sum.amount ?? 0,
      name: child.name,
      avatar: child.avatar,
      streakCount: child.streakCount,
      level: progress.level,
      xp: child.xp,
      xpIntoLevel: progress.xpIntoLevel,
      xpNeeded: progress.xpNeeded,
      percent: progress.percent,
      achievements: achievements.map((a) => ({ title: a.achievement.title, icon: a.achievement.icon })),
    });
  } catch (err) {
    next(err);
  }
});

// === Нейролаборатория урока (изолированный бюджет токенов) ===
academyBookingRouter.get('/lessons/:id/lab', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await loadLessonForActor(req.params.id, req.user!.id); // гейт участника
    res.json(await lessonLabState(req.params.id));
  } catch (err) {
    next(err);
  }
});

academyBookingRouter.post('/lessons/:id/lab/generate', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lesson } = await loadLessonForActor(req.params.id, req.user!.id);
    const state = await lessonLabState(lesson.id);
    if (!state.hasLab) throw new HttpError(400, 'NO_LAB', 'В этом уроке нет лаборатории');
    if (state.granted === null) throw new HttpError(409, 'LAB_NOT_STARTED', 'Лаборатория откроется, когда преподаватель начнёт урок');
    const generation = await createFreeChatProject(req.user!.id, req.body, {
      kind: 'lesson-lab',
      lessonId: lesson.id,
      videoAllowed: state.videoAllowed,
    });
    res.status(201).json({ generation, lab: await lessonLabState(lesson.id) });
  } catch (err) {
    next(err);
  }
});

academyBookingRouter.get('/lessons/:id/lab/history', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await loadLessonForActor(req.params.id, req.user!.id);
    const projects = await prisma.project.findMany({
      where: { mode: 'lesson-lab', userInputs: { path: ['labLessonId'], equals: req.params.id } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, status: true, progress: true, resultImage: true, resultVideo: true, inputText: true, createdAt: true },
    });
    res.json({ items: projects.map((p) => ({
      id: p.id, status: p.status, progress: p.progress,
      resultUrl: p.resultVideo ?? p.resultImage ?? null,
      isVideo: Boolean(p.resultVideo),
      prompt: p.inputText, createdAt: p.createdAt.toISOString(),
    })) });
  } catch (err) {
    next(err);
  }
});

// === Преподаватель ===

academyBookingRouter.get('/teacher/me', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await ensureTeacherProfile(req.user!.id);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

academyBookingRouter.get('/teacher/slots', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await ensureTeacherProfile(req.user!.id);
    const slots = await prisma.teacherSlot.findMany({
      where: { teacherId: profile.id, startsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
    });
    res.json({ slots: slots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), durationMin: s.durationMin, isBooked: s.isBooked })) });
  } catch (err) {
    next(err);
  }
});

academyBookingRouter.post('/teacher/slots', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSlotSchema.parse(req.body);
    const profile = await ensureTeacherProfile(req.user!.id);
    const startsAt = new Date(data.startsAt);
    if (startsAt <= new Date()) throw new HttpError(400, 'SLOT_IN_PAST', 'Слот должен быть в будущем');
    const slot = await prisma.teacherSlot.create({ data: { teacherId: profile.id, startsAt, durationMin: data.durationMin } });
    res.status(201).json({ slot: { id: slot.id, startsAt: slot.startsAt.toISOString(), durationMin: slot.durationMin, isBooked: slot.isBooked } });
  } catch (err) {
    next(err);
  }
});

// Массовое добавление слотов: расписание удобнее заводить сеткой (день × время ×
// повтор по неделям), а не по одному. Дубли по времени тихо пропускаются.
const bulkSlotsSchema = z.object({
  startsAt: z.array(z.string().datetime()).min(1).max(200),
  durationMin: z.union([z.literal(25), z.literal(45)]),
});

academyBookingRouter.post('/teacher/slots/bulk', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = bulkSlotsSchema.parse(req.body);
    const profile = await ensureTeacherProfile(req.user!.id);
    const now = new Date();
    const wanted = [...new Set(data.startsAt)]
      .map((iso) => new Date(iso))
      .filter((date) => date > now);
    if (wanted.length === 0) throw new HttpError(400, 'SLOT_IN_PAST', 'Все указанные слоты в прошлом');

    const existing = await prisma.teacherSlot.findMany({
      where: { teacherId: profile.id, startsAt: { in: wanted } },
      select: { startsAt: true },
    });
    const taken = new Set(existing.map((s) => s.startsAt.getTime()));
    const fresh = wanted.filter((date) => !taken.has(date.getTime()));

    if (fresh.length > 0) {
      await prisma.teacherSlot.createMany({
        data: fresh.map((startsAt) => ({ teacherId: profile.id, startsAt, durationMin: data.durationMin })),
      });
    }
    res.status(201).json({ created: fresh.length, skipped: wanted.length - fresh.length });
  } catch (err) {
    next(err);
  }
});

academyBookingRouter.delete('/teacher/slots/:id', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await ensureTeacherProfile(req.user!.id);
    const slot = await prisma.teacherSlot.findFirst({ where: { id: req.params.id, teacherId: profile.id } });
    if (!slot) throw new HttpError(404, 'SLOT_NOT_FOUND', 'Слот не найден');
    if (slot.isBooked) throw new HttpError(400, 'SLOT_BOOKED', 'Нельзя удалить забронированный слот');
    await prisma.teacherSlot.delete({ where: { id: slot.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

academyBookingRouter.get('/teacher/lessons', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await ensureTeacherProfile(req.user!.id);
    const lessons = await prisma.lesson.findMany({
      where: { teacherId: profile.id },
      include: lessonInclude,
      orderBy: { startsAt: 'desc' },
      take: 100,
    });
    const titles = await topicTitles(lessons.map((l) => l.topicId ?? ''));
    res.json({ lessons: lessons.map((l) => toLessonDto(l, titles)) });
  } catch (err) {
    next(err);
  }
});

academyBookingRouter.post('/teacher/lessons/:id/status', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = String(req.body?.status) as LessonStatusValue;
    const allowed: LessonStatusValue[] = ['AWAITING_PREP', 'GENERATING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW'];
    if (!allowed.includes(status)) throw new HttpError(400, 'INVALID_STATUS', 'Недопустимый статус урока');
    const profile = await ensureTeacherProfile(req.user!.id);
    const lesson = await prisma.lesson.findFirst({
      where: { id: req.params.id, teacherId: profile.id },
      include: { child: { select: { parentId: true } } },
    });
    if (!lesson) throw new HttpError(404, 'LESSON_NOT_FOUND', 'Урок не найден');

    await prisma.$transaction(async (tx) => {
      await tx.lesson.update({ where: { id: lesson.id }, data: { status } });
      if (status === 'READY' && lesson.status !== 'READY') {
        await addLessonSystemMessage(tx, {
          parentId: lesson.child.parentId,
          teacherId: lesson.teacherId,
          childId: lesson.childId,
          body: 'Материалы готовы: урок подготовлен преподавателем.',
        });
      }
      // Завершённый урок делает начисление доступным к выплате; неявка — списание без начисления.
      if (status === 'COMPLETED') {
        await tx.teacherEarning.updateMany({ where: { lessonId: lesson.id, status: 'PENDING' }, data: { status: 'AVAILABLE' } });
        // Тема урока помечается пройденной. Перепрохождение (тема уже пройдена) очков не даёт.
        const { newlyCompleted } = await completeLessonTopic(tx, lesson);
        if (newlyCompleted) await awardLessonCompletion(tx, lesson);
      } else if (status === 'NO_SHOW') {
        await tx.teacherEarning.updateMany({ where: { lessonId: lesson.id }, data: { status: 'REJECTED' } });
      }
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

academyBookingRouter.get('/teacher/earnings', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await ensureTeacherProfile(req.user!.id);
    const earnings = await prisma.teacherEarning.groupBy({
      by: ['status'],
      where: { teacherId: profile.id },
      _sum: { amountRub: true },
      _count: { _all: true },
    });
    res.json({ earnings: earnings.map((e) => ({ status: e.status, amountRub: e._sum.amountRub ?? 0, count: e._count._all })) });
  } catch (err) {
    next(err);
  }
});

// === Мои ученики (преподаватель): список, профиль, история, заметки ===
academyBookingRouter.get('/teacher/students', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await ensureTeacherProfile(req.user!.id);
    res.json({ students: await buildTeacherStudents(profile.id) });
  } catch (err) {
    next(err);
  }
});

academyBookingRouter.get('/teacher/students/:childId', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await ensureTeacherProfile(req.user!.id);
    if (!(await teacherTaughtChild(profile.id, req.params.childId))) {
      throw new HttpError(403, 'FORBIDDEN', 'Вы не вели этого ученика');
    }
    res.json(await buildTeacherStudentDetail(profile.id, req.params.childId));
  } catch (err) {
    next(err);
  }
});

const studentNoteSchema = z.object({ note: z.string().max(4000) });
academyBookingRouter.put('/teacher/students/:childId/note', requireAuth, requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { note } = studentNoteSchema.parse(req.body ?? {});
    const profile = await ensureTeacherProfile(req.user!.id);
    if (!(await teacherTaughtChild(profile.id, req.params.childId))) {
      throw new HttpError(403, 'FORBIDDEN', 'Вы не вели этого ученика');
    }
    res.json({ ok: true, note: await saveTeacherStudentNote(profile.id, req.params.childId, note) });
  } catch (err) {
    next(err);
  }
});
