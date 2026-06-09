import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { HttpError } from '../../utils/http-error';
import { createFreeChatProject, parseChatGenerationMeta, titleFromPrompt } from '../../services/free-chat-generation';
import { tryRecoverPiAPIProject } from '../../services/piapi-recovery-service';

export const userChatsRouter = Router();

userChatsRouter.use(requireAuth);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createChatSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

const updateChatSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

const piapiRecoveryStatuses = new Set(['PENDING', 'PROCESSING', 'FAILED']);

const projectSelect = {
  id: true,
  title: true,
  status: true,
  progress: true,
  tokensCost: true,
  inputText: true,
  resultImage: true,
  resultVideo: true,
  resultThumbnail: true,
  errorMessage: true,
  errorCode: true,
  userInputs: true,
  createdAt: true,
  completedAt: true,
  expiresAt: true,
} satisfies Prisma.ProjectSelect;

function previewFromProject(project: {
  resultThumbnail: string | null;
  resultImage: string | null;
  resultVideo: string | null;
}) {
  return project.resultThumbnail ?? project.resultImage ?? project.resultVideo ?? null;
}

function toProjectState(project: Prisma.ProjectGetPayload<{ select: typeof projectSelect }>) {
  const meta = parseChatGenerationMeta(project.userInputs);
  return {
    ...project,
    modelSlug: meta?.modelSlug ?? null,
    category: meta?.category ?? null,
    prompt: meta?.prompt ?? project.inputText ?? '',
    inputPreviewUrl: meta?.inputPreviewUrl ?? null,
    outputPreview: previewFromProject(project),
  };
}

function toMessageResponse(message: Prisma.ChatMessageGetPayload<{ include: { project: { select: typeof projectSelect } } }>) {
  return {
    id: message.id,
    chatId: message.chatId,
    createdAt: message.createdAt,
    prompt: message.prompt,
    modelSlug: message.modelSlug,
    aspectRatio: message.aspectRatio,
    duration: message.duration,
    inputRef: message.inputRef,
    projectId: message.projectId,
    project: toProjectState(message.project),
  };
}

async function requireChat(id: string, userId: string) {
  const chat = await prisma.chat.findFirst({ where: { id, userId, deletedAt: null } });
  if (!chat) throw new HttpError(404, 'CHAT_NOT_FOUND', 'Чат не найден');
  return chat;
}

userChatsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const where = { userId: req.user!.id, deletedAt: null };
    let [items, total] = await prisma.$transaction([
      prisma.chat.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: query.offset,
        take: query.limit,
        include: {
          _count: { select: { messages: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { project: { select: projectSelect } },
          },
        },
      }),
      prisma.chat.count({ where }),
    ]);

    const recovered = await recoverChatMessageProjects(
      items.flatMap((chat) => chat.messages.map((message) => message.project)),
      req.user!.id,
    );
    if (recovered) {
      [items, total] = await prisma.$transaction([
        prisma.chat.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: query.offset,
          take: query.limit,
          include: {
            _count: { select: { messages: true } },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { project: { select: projectSelect } },
            },
          },
        }),
        prisma.chat.count({ where }),
      ]);
    }

    res.json({
      items: items.map((chat) => {
        const lastMessage = chat.messages[0];
        return {
          id: chat.id,
          title: chat.title,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          messageCount: chat._count.messages,
          lastResultPreview: lastMessage ? previewFromProject(lastMessage.project) : null,
          lastStatus: lastMessage?.project.status ?? null,
        };
      }),
      total,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (err) {
    next(err);
  }
});

userChatsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createChatSchema.parse(req.body);
    const chat = await prisma.chat.create({
      data: {
        userId: req.user!.id,
        title: body.title || 'Новый чат',
      },
    });
    res.status(201).json({ chat });
  } catch (err) {
    next(err);
  }
});

userChatsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chat = await requireChat(req.params.id, req.user!.id);
    let messages = await prisma.chatMessage.findMany({
      where: { chatId: chat.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { project: { select: projectSelect } },
    });
    const recovered = await recoverChatMessageProjects(messages.map((message) => message.project), req.user!.id);
    if (recovered) {
      messages = await prisma.chatMessage.findMany({
        where: { chatId: chat.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { project: { select: projectSelect } },
      });
    }
    res.json({
      chat,
      messages: messages.reverse().map(toMessageResponse),
    });
  } catch (err) {
    next(err);
  }
});

async function recoverChatMessageProjects(items: Array<{ id: string; status: string }>, userId: string) {
  const candidates = items
    .filter((item) => piapiRecoveryStatuses.has(item.status))
    .slice(0, 5);
  if (candidates.length === 0) return false;
  const results = await Promise.allSettled(candidates.map((item) => tryRecoverPiAPIProject(item.id, userId)));
  return results.some((result) => result.status === 'fulfilled' && result.value);
}

userChatsRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateChatSchema.parse(req.body);
    const current = await requireChat(req.params.id, req.user!.id);
    const chat = await prisma.chat.update({
      where: { id: current.id },
      data: { title: body.title },
    });
    res.json({ chat });
  } catch (err) {
    next(err);
  }
});

userChatsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const current = await requireChat(req.params.id, req.user!.id);
    await prisma.chat.update({
      where: { id: current.id },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

userChatsRouter.post('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chat = await requireChat(req.params.id, req.user!.id);
    const generation = await createFreeChatProject(req.user!.id, req.body);
    const messageCount = await prisma.chatMessage.count({ where: { chatId: chat.id } });
    const shouldAutotitle = messageCount === 0 && (!chat.title || chat.title === 'Новый чат');
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          chatId: chat.id,
          prompt: generation.body.prompt ?? '',
          modelSlug: generation.model.slug,
          aspectRatio: generation.aspectRatio,
          duration: generation.duration,
          inputRef: generation.input?.ref ?? null,
          projectId: generation.projectId,
        },
        include: { project: { select: projectSelect } },
      });
      await tx.chat.update({
        where: { id: chat.id },
        data: {
          title: shouldAutotitle
            ? (generation.body.prompt ? titleFromPrompt(generation.body.prompt, '') : generation.model.functionTitle)
            : chat.title,
          updatedAt: new Date(),
        },
      });
      return created;
    });

    res.status(202).json({
      message: toMessageResponse(message),
      projectId: generation.projectId,
      project: generation.project,
      status: generation.status,
      estimatedDurationSec: generation.estimatedDurationSec,
    });
  } catch (err) {
    next(err);
  }
});
