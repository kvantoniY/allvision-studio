import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma, type Prisma, type ThreadMessageRole } from '@allvision/database';
import { lessonReportSchema, threadMessageSchema } from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/require-role';
import { uploadAcademyMessageImage } from '../middleware/upload';
import { readChildAsset } from '../services/child-photo-storage';
import { readThreadAttachment, saveThreadAttachment } from '../services/academy-operations-storage';
import {
  addLessonSystemMessage,
  loadThreadForActor,
  reportInclude,
  threadActorInclude,
  toLessonReportDto,
  toThreadDto,
  toThreadMessageDto,
} from '../services/academy-operations-service';
import { HttpError } from '../utils/http-error';

export const academyOperationsRouter = Router();
academyOperationsRouter.use(requireAuth);

function actor(req: Request) {
  return { id: req.user!.id, role: req.user!.role };
}

async function loadReportForActor(req: Request, reportId: string) {
  const report = await prisma.lessonReport.findUnique({ where: { id: reportId }, include: reportInclude });
  if (!report) throw new HttpError(404, 'REPORT_NOT_FOUND', 'Отчёт не найден');
  const allowed = req.user!.role === 'ADMIN'
    || report.lesson.child.parentId === req.user!.id
    || report.lesson.teacher.userId === req.user!.id;
  if (!allowed) throw new HttpError(404, 'REPORT_NOT_FOUND', 'Отчёт не найден');
  return report;
}

// === Отчёт преподавателя после урока ===

academyOperationsRouter.get('/teacher/lessons/:lessonId/report', requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await prisma.lessonReport.findFirst({
      where: {
        lessonId: req.params.lessonId,
        ...(req.user!.role === 'ADMIN' ? {} : { lesson: { teacher: { userId: req.user!.id } } }),
      },
      include: reportInclude,
    });
    res.json({ report: report ? await toLessonReportDto(report) : null });
  } catch (error) {
    next(error);
  }
});

academyOperationsRouter.post('/teacher/lessons/:lessonId/report', requireRole('TEACHER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = lessonReportSchema.parse(req.body);
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: req.params.lessonId,
        ...(req.user!.role === 'ADMIN' ? {} : { teacher: { userId: req.user!.id } }),
      },
      include: { child: { select: { id: true, parentId: true, deletedAt: true } }, teacher: { select: { id: true } }, report: true },
    });
    if (!lesson) throw new HttpError(404, 'LESSON_NOT_FOUND', 'Урок не найден');
    if (lesson.child.deletedAt) throw new HttpError(409, 'CHILD_DELETED', 'Профиль ребёнка удалён');
    if (!['COMPLETED', 'REPORT_SENT'].includes(lesson.status)) {
      throw new HttpError(409, 'LESSON_NOT_COMPLETED', 'Отчёт можно отправить только после завершения урока');
    }
    const assetIds = [...new Set(input.resultAssetIds)];
    if (assetIds.length > 0) {
      const count = await prisma.childAsset.count({ where: { id: { in: assetIds }, childId: lesson.childId } });
      if (count !== assetIds.length) throw new HttpError(400, 'REPORT_ASSET_INVALID', 'Один из результатов не принадлежит ребёнку');
    }

    const reportId = await prisma.$transaction(async (tx) => {
      const report = await tx.lessonReport.upsert({
        where: { lessonId: lesson.id },
        create: {
          lessonId: lesson.id,
          createdById: req.user!.id,
          summary: input.summary,
          successes: input.successes,
          recommendation: input.recommendation,
          resultAssetIds: assetIds,
        },
        update: {
          summary: input.summary,
          successes: input.successes,
          recommendation: input.recommendation,
          resultAssetIds: assetIds,
          parentReadAt: null,
        },
      });
      await tx.lesson.update({ where: { id: lesson.id }, data: { status: 'REPORT_SENT' } });
      if (!lesson.report) {
        await addLessonSystemMessage(tx, {
          parentId: lesson.child.parentId,
          teacherId: lesson.teacher.id,
          childId: lesson.childId,
          body: 'Преподаватель отправил отчёт по занятию.',
        });
      }
      return report.id;
    });
    const report = await prisma.lessonReport.findUniqueOrThrow({ where: { id: reportId }, include: reportInclude });
    res.json({ report: await toLessonReportDto(report) });
  } catch (error) {
    next(error);
  }
});

academyOperationsRouter.get('/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!['PARENT', 'USER', 'ADMIN'].includes(req.user!.role)) {
      throw new HttpError(403, 'FORBIDDEN_ROLE', 'Отчёты доступны родителю');
    }
    const childId = typeof req.query.childId === 'string' ? req.query.childId : undefined;
    const reports = await prisma.lessonReport.findMany({
      where: {
        ...(req.user!.role === 'ADMIN' ? {} : { lesson: { child: { parentId: req.user!.id } } }),
        ...(childId ? { lesson: { childId, ...(req.user!.role === 'ADMIN' ? {} : { child: { parentId: req.user!.id } }) } } : {}),
      },
      include: reportInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ reports: await Promise.all(reports.map(toLessonReportDto)) });
  } catch (error) {
    next(error);
  }
});

academyOperationsRouter.post('/reports/:reportId/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await loadReportForActor(req, req.params.reportId);
    if (req.user!.role !== 'ADMIN' && report.lesson.child.parentId !== req.user!.id) {
      throw new HttpError(403, 'REPORT_READ_FORBIDDEN', 'Только родитель может отметить отчёт прочитанным');
    }
    await prisma.lessonReport.updateMany({
      where: { id: report.id, parentReadAt: null },
      data: { parentReadAt: new Date() },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

academyOperationsRouter.get('/reports/:reportId/assets/:assetId/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await loadReportForActor(req, req.params.reportId);
    if (!report.resultAssetIds.includes(req.params.assetId)) throw new HttpError(404, 'REPORT_ASSET_NOT_FOUND', 'Результат не найден');
    const asset = await prisma.childAsset.findFirst({ where: { id: req.params.assetId, childId: report.lesson.childId } });
    if (!asset) throw new HttpError(404, 'REPORT_ASSET_NOT_FOUND', 'Результат не найден');
    const buffer = await readChildAsset(asset.storageKey).catch(() => {
      throw new HttpError(404, 'REPORT_ASSET_FILE_MISSING', 'Файл результата недоступен');
    });
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

// === Родительско-учительский мессенджер ===

academyOperationsRouter.get('/threads', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const where: Prisma.ThreadWhereInput = req.user!.role === 'ADMIN'
      ? {}
      : req.user!.role === 'TEACHER'
        ? { teacher: { userId: req.user!.id } }
        : { parentId: req.user!.id };
    const threads = await prisma.thread.findMany({
      where,
      include: {
        ...threadActorInclude,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { author: { select: { name: true, email: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    res.json({
      threads: threads.map((thread) => toThreadDto(
        thread,
        thread.messages[0] ? toThreadMessageDto(thread.messages[0]) : null,
      )),
    });
  } catch (error) {
    next(error);
  }
});

academyOperationsRouter.get('/threads/:threadId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await loadThreadForActor(actor(req), req.params.threadId);
    const messages = await prisma.threadMessage.findMany({
      where: { threadId: req.params.threadId },
      include: { author: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    res.json({ messages: messages.map(toThreadMessageDto) });
  } catch (error) {
    next(error);
  }
});

academyOperationsRouter.post('/threads/:threadId/messages', uploadAcademyMessageImage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const thread = await loadThreadForActor(actor(req), req.params.threadId);
    const { body } = threadMessageSchema.parse({ body: typeof req.body?.body === 'string' ? req.body.body : undefined });
    if (!body && !req.file) throw new HttpError(400, 'MESSAGE_EMPTY', 'Напишите сообщение или прикрепите изображение');
    let attachmentStorageKey: string | null = null;
    if (req.file) {
      attachmentStorageKey = await saveThreadAttachment({
        parentId: thread.parentId,
        childId: thread.childId,
        threadId: thread.id,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
      });
    }
    const role: ThreadMessageRole = req.user!.role === 'ADMIN'
      ? 'ADMIN'
      : req.user!.role === 'TEACHER' ? 'TEACHER' : 'PARENT';
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.threadMessage.create({
        data: {
          threadId: thread.id,
          authorId: req.user!.id,
          role,
          body: body || null,
          attachmentStorageKey,
          attachmentFileName: req.file?.originalname ?? null,
          attachmentMimeType: req.file?.mimetype ?? null,
          attachmentFileSize: req.file?.size ?? null,
        },
        include: { author: { select: { name: true, email: true } } },
      });
      await tx.thread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
      return created;
    });
    res.status(201).json({ message: toThreadMessageDto(message) });
  } catch (error) {
    next(error);
  }
});

academyOperationsRouter.get('/threads/:threadId/messages/:messageId/attachment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await loadThreadForActor(actor(req), req.params.threadId);
    const message = await prisma.threadMessage.findFirst({
      where: { id: req.params.messageId, threadId: req.params.threadId },
    });
    if (!message?.attachmentStorageKey || !message.attachmentMimeType) {
      throw new HttpError(404, 'MESSAGE_ATTACHMENT_NOT_FOUND', 'Вложение не найдено');
    }
    const buffer = await readThreadAttachment(message.attachmentStorageKey).catch(() => {
      throw new HttpError(404, 'MESSAGE_ATTACHMENT_FILE_MISSING', 'Файл вложения недоступен');
    });
    res.setHeader('Content-Type', message.attachmentMimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});
