import { prisma, type Prisma, type ThreadMessageRole } from '@allvision/database';
import type { LessonReportDto, ThreadDto, ThreadMessageDto } from '@allvision/shared';
import { HttpError } from '../utils/http-error';

type TransactionClient = Prisma.TransactionClient;

export async function addLessonSystemMessage(
  tx: TransactionClient,
  input: {
    parentId: string;
    teacherId: string;
    childId: string;
    body: string;
  },
) {
  const thread = await tx.thread.upsert({
    where: {
      parentId_teacherId_childId: {
        parentId: input.parentId,
        teacherId: input.teacherId,
        childId: input.childId,
      },
    },
    create: {
      parentId: input.parentId,
      teacherId: input.teacherId,
      childId: input.childId,
    },
    update: { updatedAt: new Date() },
  });
  await tx.threadMessage.create({
    data: { threadId: thread.id, role: 'SYSTEM', body: input.body },
  });
  return thread;
}

export const threadActorInclude = {
  parent: { select: { id: true, name: true, email: true } },
  teacher: { select: { id: true, userId: true, user: { select: { name: true, email: true } } } },
  child: { select: { id: true, name: true, deletedAt: true } },
} satisfies Prisma.ThreadInclude;

type ThreadForActor = Prisma.ThreadGetPayload<{ include: typeof threadActorInclude }>;

export function canAccessThread(
  user: { id: string; role: string },
  thread: Pick<ThreadForActor, 'parentId' | 'teacher'>,
): boolean {
  return user.role === 'ADMIN' || thread.parentId === user.id || thread.teacher.userId === user.id;
}

export async function loadThreadForActor(user: { id: string; role: string }, threadId: string) {
  const thread = await prisma.thread.findUnique({ where: { id: threadId }, include: threadActorInclude });
  if (!thread || !canAccessThread(user, thread)) {
    throw new HttpError(404, 'THREAD_NOT_FOUND', 'Диалог не найден');
  }
  return thread;
}

function authorName(message: {
  role: ThreadMessageRole;
  author: { name: string | null; email: string } | null;
}): string {
  if (message.role === 'SYSTEM') return 'Система Academy';
  if (message.role === 'ADMIN') return message.author?.name ?? 'Администратор';
  return message.author?.name ?? message.author?.email ?? (message.role === 'TEACHER' ? 'Преподаватель' : 'Родитель');
}

export function toThreadMessageDto(message: {
  id: string;
  threadId: string;
  role: ThreadMessageRole;
  body: string | null;
  attachmentStorageKey: string | null;
  attachmentFileName: string | null;
  attachmentMimeType: string | null;
  attachmentFileSize: number | null;
  createdAt: Date;
  author: { name: string | null; email: string } | null;
}): ThreadMessageDto {
  return {
    id: message.id,
    role: message.role,
    authorName: authorName(message),
    body: message.body,
    attachment: message.attachmentStorageKey && message.attachmentFileName
      && message.attachmentMimeType && message.attachmentFileSize !== null
      ? {
          fileName: message.attachmentFileName,
          mimeType: message.attachmentMimeType,
          fileSize: message.attachmentFileSize,
          fileUrl: `/api/academy/operations/threads/${message.threadId}/messages/${message.id}/attachment`,
        }
      : null,
    createdAt: message.createdAt.toISOString(),
  };
}

export function toThreadDto(
  thread: ThreadForActor,
  lastMessage: ThreadMessageDto | null,
): ThreadDto {
  return {
    id: thread.id,
    childId: thread.child.id,
    childName: thread.child.deletedAt ? 'Удалённый профиль' : thread.child.name,
    parentName: thread.parent.name ?? thread.parent.email,
    teacherId: thread.teacher.id,
    teacherName: thread.teacher.user.name ?? thread.teacher.user.email,
    updatedAt: thread.updatedAt.toISOString(),
    lastMessage,
  };
}

export const reportInclude = {
  lesson: {
    include: {
      child: { select: { id: true, name: true, parentId: true, deletedAt: true } },
      teacher: { select: { userId: true, user: { select: { name: true, email: true } } } },
    },
  },
} satisfies Prisma.LessonReportInclude;

type ReportWithLesson = Prisma.LessonReportGetPayload<{ include: typeof reportInclude }>;

export async function toLessonReportDto(report: ReportWithLesson): Promise<LessonReportDto> {
  const assets = report.resultAssetIds.length > 0
    ? await prisma.childAsset.findMany({
        where: { id: { in: report.resultAssetIds }, childId: report.lesson.childId },
        select: { id: true, title: true },
      })
    : [];
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    id: report.id,
    lessonId: report.lessonId,
    childId: report.lesson.childId,
    childName: report.lesson.child.deletedAt ? 'Удалённый профиль' : report.lesson.child.name,
    teacherName: report.lesson.teacher.user.name ?? report.lesson.teacher.user.email,
    startsAt: report.lesson.startsAt.toISOString(),
    summary: report.summary,
    successes: report.successes,
    recommendation: report.recommendation,
    resultAssets: report.resultAssetIds.flatMap((id) => {
      const asset = assetsById.get(id);
      return asset ? [{
        id: asset.id,
        title: asset.title,
        fileUrl: `/api/academy/operations/reports/${report.id}/assets/${asset.id}/file`,
      }] : [];
    }),
    parentReadAt: report.parentReadAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}
