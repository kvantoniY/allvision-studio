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
    const dto: AvailableTeacherDto[] = teachers.map((t) => ({
      teacherId: t.id,
      name: t.user.name ?? t.user.email,
      bio: t.bio,
      subjects: t.subjects,
      slots: t.slots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), durationMin: s.durationMin, isBooked: s.isBooked })),
    }));
    res.json({ teachers: dto });
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
        await awardLessonCompletion(tx, lesson);
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
