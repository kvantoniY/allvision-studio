import crypto from 'node:crypto';
import { Prisma, prisma } from '@allvision/database';
import { HttpError } from '../utils/http-error';
import * as fileService from './file-service';

const ticketInclude = {
  user: { select: { id: true, email: true, name: true } },
  resolvedBy: { select: { id: true, email: true, name: true, role: true } },
  messages: {
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, email: true, name: true, role: true } },
      attachments: { orderBy: { createdAt: 'asc' } },
    },
  },
} satisfies Prisma.SupportTicketInclude;

const ticketListInclude = {
  user: { select: { id: true, email: true, name: true } },
  resolvedBy: { select: { id: true, email: true, name: true, role: true } },
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: {
      author: { select: { id: true, email: true, name: true, role: true } },
      attachments: { orderBy: { createdAt: 'asc' } },
    },
  },
  _count: { select: { messages: true } },
} satisfies Prisma.SupportTicketInclude;

export type SupportActor = {
  id: string;
  role: 'USER' | 'ADMIN' | 'READONLY_ADMIN';
};

function filesOf(files: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] } | undefined) {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
}

function normalizeBody(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeSubject(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
}

async function uploadAttachments(userId: string, ticketId: string, files: Express.Multer.File[]) {
  return Promise.all(files.map((file) => fileService.uploadSupportAttachment(userId, ticketId, file)));
}

async function cleanupUploaded(items: Array<{ key: string }>) {
  await Promise.allSettled(items.map((item) => fileService.deleteFile(item.key)));
}

function attachmentCreateData(items: Awaited<ReturnType<typeof uploadAttachments>>) {
  return items.map((item) => ({
    fileName: item.fileName,
    mimeType: item.mimeType,
    fileSize: item.fileSize,
    storageKey: item.key,
    publicUrl: item.url,
    kind: item.kind,
  }));
}

function requireMessageContent(body: string, files: Express.Multer.File[]) {
  if (!body && files.length === 0) {
    throw new HttpError(400, 'MESSAGE_REQUIRED', 'Напишите сообщение или прикрепите файл');
  }
}

export async function listUserTickets(userId: string, params: { page: number; limit: number; status?: 'OPEN' | 'RESOLVED' }) {
  const where: Prisma.SupportTicketWhereInput = {
    userId,
    ...(params.status ? { status: params.status } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      include: ticketListInclude,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return { items, total, page: params.page, limit: params.limit };
}

export async function listAdminTickets(params: { page: number; limit: number; status?: 'OPEN' | 'RESOLVED'; search?: string }) {
  const where: Prisma.SupportTicketWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.search ? {
      OR: [
        { subject: { contains: params.search, mode: 'insensitive' } },
        { user: { email: { contains: params.search, mode: 'insensitive' } } },
        { user: { name: { contains: params.search, mode: 'insensitive' } } },
      ],
    } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      include: ticketListInclude,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return { items, total, page: params.page, limit: params.limit };
}

export async function getUserTicket(userId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId },
    include: ticketInclude,
  });
  if (!ticket) throw new HttpError(404, 'SUPPORT_TICKET_NOT_FOUND', 'Тикет не найден');
  return ticket;
}

export async function getAdminTicket(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: ticketInclude,
  });
  if (!ticket) throw new HttpError(404, 'SUPPORT_TICKET_NOT_FOUND', 'Тикет не найден');
  return ticket;
}

export async function createTicket(userId: string, params: { subject: unknown; body: unknown; files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] } }) {
  const subject = normalizeSubject(params.subject);
  const body = normalizeBody(params.body);
  const files = filesOf(params.files);

  if (subject.length < 3) {
    throw new HttpError(400, 'SUBJECT_REQUIRED', 'Укажите тему обращения');
  }
  if (subject.length > 160) {
    throw new HttpError(400, 'SUBJECT_TOO_LONG', 'Тема обращения слишком длинная');
  }
  requireMessageContent(body, files);

  const ticketId = crypto.randomUUID();
  const uploaded = await uploadAttachments(userId, ticketId, files);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.create({
        data: {
          id: ticketId,
          userId,
          subject,
        },
      });
      await tx.supportMessage.create({
        data: {
          ticketId,
          authorId: userId,
          body: body || null,
          attachments: { create: attachmentCreateData(uploaded) },
        },
      });
    });
  } catch (error) {
    await cleanupUploaded(uploaded);
    throw error;
  }

  return getUserTicket(userId, ticketId);
}

export async function addMessage(actor: SupportActor, ticketId: string, params: { body: unknown; files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] } }) {
  const body = normalizeBody(params.body);
  const files = filesOf(params.files);
  requireMessageContent(body, files);

  const ticket = actor.role === 'ADMIN'
    ? await getAdminTicket(ticketId)
    : await getUserTicket(actor.id, ticketId);

  if (ticket.status === 'RESOLVED') {
    throw new HttpError(400, 'SUPPORT_TICKET_RESOLVED', 'Тикет уже завершён');
  }

  const uploaded = await uploadAttachments(ticket.userId, ticket.id, files);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          authorId: actor.id,
          body: body || null,
          attachments: { create: attachmentCreateData(uploaded) },
        },
      });
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: { updatedAt: new Date() },
      });
    });
  } catch (error) {
    await cleanupUploaded(uploaded);
    throw error;
  }

  return actor.role === 'ADMIN' ? getAdminTicket(ticket.id) : getUserTicket(actor.id, ticket.id);
}

export async function resolveTicket(actor: SupportActor, ticketId: string) {
  const ticket = actor.role === 'ADMIN'
    ? await getAdminTicket(ticketId)
    : await getUserTicket(actor.id, ticketId);

  if (ticket.status === 'RESOLVED') return ticket;

  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolvedById: actor.id,
    },
  });

  return actor.role === 'ADMIN' ? getAdminTicket(ticket.id) : getUserTicket(actor.id, ticket.id);
}
