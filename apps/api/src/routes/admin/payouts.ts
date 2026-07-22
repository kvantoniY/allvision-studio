import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '@allvision/database';
import {
  payoutPeriodSchema,
  payoutRejectSchema,
  type TeacherPayoutDto,
  type TeacherPayoutSummaryDto,
} from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { uploadPayoutProof } from '../../middleware/upload';
import { readPayoutProof, savePayoutProof } from '../../services/academy-operations-storage';
import { HttpError } from '../../utils/http-error';

export const adminPayoutsRouter = Router();
adminPayoutsRouter.use(requireAuth, requireAdmin);

function period(value: { periodStart: string; periodEnd: string }) {
  const periodStart = new Date(`${value.periodStart}T00:00:00.000Z`);
  const periodEnd = new Date(`${value.periodEnd}T23:59:59.999Z`);
  return { periodStart, periodEnd };
}

type PayoutWithTeacher = Awaited<ReturnType<typeof loadPayout>>;

async function loadPayout(id: string) {
  return prisma.teacherPayout.findUnique({
    where: { id },
    include: {
      teacher: { include: { user: { select: { name: true, email: true } } } },
      _count: { select: { earnings: true } },
    },
  });
}

function toPayoutDto(payout: NonNullable<PayoutWithTeacher>): TeacherPayoutDto {
  return {
    id: payout.id,
    teacherId: payout.teacherId,
    teacherName: payout.teacher.user.name ?? payout.teacher.user.email,
    periodStart: payout.periodStart.toISOString().slice(0, 10),
    periodEnd: payout.periodEnd.toISOString().slice(0, 10),
    amountRub: payout.amountRub,
    earningsCount: payout._count.earnings,
    status: payout.status,
    confirmationFileName: payout.confirmationFileName,
    confirmationFileUrl: payout.confirmationStorageKey ? `/api/admin/payouts/${payout.id}/proof` : null,
    rejectionReason: payout.rejectionReason,
    paidAt: payout.paidAt?.toISOString() ?? null,
    createdAt: payout.createdAt.toISOString(),
  };
}

adminPayoutsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = payoutPeriodSchema.parse({
      periodStart: req.query.periodStart,
      periodEnd: req.query.periodEnd,
    });
    const dates = period(input);
    const [earnings, payouts] = await Promise.all([
      prisma.teacherEarning.findMany({
        where: { lesson: { startsAt: { gte: dates.periodStart, lte: dates.periodEnd } } },
        include: { teacher: { include: { user: { select: { name: true, email: true } } } } },
      }),
      prisma.teacherPayout.findMany({
        where: dates,
        include: {
          teacher: { include: { user: { select: { name: true, email: true } } } },
          _count: { select: { earnings: true } },
        },
      }),
    ]);
    const payoutByTeacher = new Map(payouts.map((item) => [item.teacherId, item]));
    const summary = new Map<string, TeacherPayoutSummaryDto>();
    for (const earning of earnings) {
      const row = summary.get(earning.teacherId) ?? {
        teacherId: earning.teacherId,
        teacherName: earning.teacher.user.name ?? earning.teacher.user.email,
        pendingRub: 0,
        availableRub: 0,
        paidRub: 0,
        rejectedRub: 0,
        availableCount: 0,
        payout: null,
      };
      if (earning.status === 'PENDING') row.pendingRub += earning.amountRub;
      if (earning.status === 'AVAILABLE') {
        row.availableRub += earning.amountRub;
        row.availableCount += 1;
      }
      if (earning.status === 'PAID') row.paidRub += earning.amountRub;
      if (earning.status === 'REJECTED') row.rejectedRub += earning.amountRub;
      summary.set(earning.teacherId, row);
    }
    for (const payout of payouts) {
      const row = summary.get(payout.teacherId) ?? {
        teacherId: payout.teacherId,
        teacherName: payout.teacher.user.name ?? payout.teacher.user.email,
        pendingRub: 0,
        availableRub: 0,
        paidRub: 0,
        rejectedRub: 0,
        availableCount: 0,
        payout: null,
      };
      row.payout = toPayoutDto(payout);
      summary.set(payout.teacherId, row);
    }
    // Map нужен выше для явной защиты от случайного дублирования периода в DTO.
    for (const row of summary.values()) {
      const payout = payoutByTeacher.get(row.teacherId);
      if (payout) row.payout = toPayoutDto(payout);
    }
    res.json({ period: input, teachers: [...summary.values()].sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'ru')) });
  } catch (error) {
    next(error);
  }
});

adminPayoutsRouter.post('/teachers/:teacherId/prepare', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = payoutPeriodSchema.parse(req.body);
    const dates = period(input);
    const existing = await prisma.teacherPayout.findUnique({
      where: { teacherId_periodStart_periodEnd: { teacherId: req.params.teacherId, ...dates } },
    });
    if (existing) throw new HttpError(409, 'PAYOUT_EXISTS', 'Выплата за этот период уже сформирована');
    const earnings = await prisma.teacherEarning.findMany({
      where: {
        teacherId: req.params.teacherId,
        status: 'AVAILABLE',
        payoutId: null,
        lesson: { startsAt: { gte: dates.periodStart, lte: dates.periodEnd } },
      },
      select: { id: true, amountRub: true },
    });
    if (earnings.length === 0) throw new HttpError(409, 'NO_AVAILABLE_EARNINGS', 'Нет доступных начислений за выбранный период');
    const amountRub = earnings.reduce((sum, item) => sum + item.amountRub, 0);
    const payoutId = await prisma.$transaction(async (tx) => {
      const payout = await tx.teacherPayout.create({
        data: {
          teacherId: req.params.teacherId,
          ...dates,
          amountRub,
          status: 'AVAILABLE',
          createdById: req.user!.id,
        },
      });
      await tx.teacherEarning.updateMany({
        where: { id: { in: earnings.map((item) => item.id) }, status: 'AVAILABLE', payoutId: null },
        data: { payoutId: payout.id },
      });
      return payout.id;
    });
    const payout = await loadPayout(payoutId);
    res.status(201).json({ payout: toPayoutDto(payout!) });
  } catch (error) {
    next(error);
  }
});

adminPayoutsRouter.post('/:id/pay', uploadPayoutProof, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payout = await loadPayout(req.params.id);
    if (!payout) throw new HttpError(404, 'PAYOUT_NOT_FOUND', 'Выплата не найдена');
    if (payout.status !== 'AVAILABLE') throw new HttpError(409, 'PAYOUT_STATUS_INVALID', 'Оплатить можно только доступную выплату');
    if (!req.file) throw new HttpError(400, 'PAYOUT_PROOF_REQUIRED', 'Прикрепите подтверждение выплаты');
    const storageKey = await savePayoutProof({ payoutId: payout.id, buffer: req.file.buffer, mimeType: req.file.mimetype });
    await prisma.$transaction(async (tx) => {
      await tx.teacherPayout.update({
        where: { id: payout.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          confirmationStorageKey: storageKey,
          confirmationFileName: req.file!.originalname,
          confirmationMimeType: req.file!.mimetype,
          rejectionReason: null,
        },
      });
      await tx.teacherEarning.updateMany({
        where: { payoutId: payout.id, status: 'AVAILABLE' },
        data: { status: 'PAID' },
      });
    });
    res.json({ payout: toPayoutDto((await loadPayout(payout.id))!) });
  } catch (error) {
    next(error);
  }
});

adminPayoutsRouter.post('/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = payoutRejectSchema.parse(req.body);
    const payout = await loadPayout(req.params.id);
    if (!payout) throw new HttpError(404, 'PAYOUT_NOT_FOUND', 'Выплата не найдена');
    if (payout.status !== 'AVAILABLE') throw new HttpError(409, 'PAYOUT_STATUS_INVALID', 'Корректировать можно только доступную выплату');
    await prisma.$transaction(async (tx) => {
      await tx.teacherPayout.update({ where: { id: payout.id }, data: { status: 'REJECTED', rejectionReason: reason } });
      await tx.teacherEarning.updateMany({ where: { payoutId: payout.id, status: 'AVAILABLE' }, data: { status: 'REJECTED' } });
    });
    res.json({ payout: toPayoutDto((await loadPayout(payout.id))!) });
  } catch (error) {
    next(error);
  }
});

adminPayoutsRouter.get('/:id/proof', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payout = await prisma.teacherPayout.findUnique({ where: { id: req.params.id } });
    if (!payout?.confirmationStorageKey || !payout.confirmationMimeType) {
      throw new HttpError(404, 'PAYOUT_PROOF_NOT_FOUND', 'Подтверждение выплаты не найдено');
    }
    const buffer = await readPayoutProof(payout.confirmationStorageKey).catch(() => {
      throw new HttpError(404, 'PAYOUT_PROOF_FILE_MISSING', 'Файл подтверждения недоступен');
    });
    res.setHeader('Content-Type', payout.confirmationMimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});
