import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@allvision/database';
import { ORDER_CONTACT_CHANNELS } from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { HttpError } from '../../utils/http-error';
import { createCustomOrder, payCustomOrder } from '../../services/order-service';
import { uploadEditorMedia as uploadOrderFile } from '../../middleware/upload';
import * as fileService from '../../services/file-service';

export const userOrdersRouter = Router();

userOrdersRouter.use(requireAuth);

const listSelect = {
  id: true,
  typeTitle: true,
  status: true,
  quotedPriceCoins: true,
  resultUrl: true,
  createdAt: true,
  updatedAt: true,
  orderType: { select: { slug: true, coverImage: true, leadTimeDays: true } },
} as const;

const createSchema = z.object({
  typeSlug: z.string().trim().min(1).max(100),
  brief: z.record(z.unknown()).default({}),
  attachments: z.array(z.string().trim().min(1).max(2000)).max(20).default([]),
  contactName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().toLowerCase().email().max(200),
  contactPhone: z.string().trim().max(40).optional(),
  contactMessenger: z.enum(ORDER_CONTACT_CHANNELS).optional(),
  contactHandle: z.string().trim().max(120).optional(),
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

async function ownedOrder(userId: string, id: string) {
  const order = await prisma.customOrder.findFirst({
    where: { id, userId },
    select: {
      ...listSelect,
      brief: true,
      attachments: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      contactMessenger: true,
      contactHandle: true,
      adminNote: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, body: true, fromAdmin: true, createdAt: true },
      },
    },
  });
  // 404 вместо 403: существование чужой заявки — тоже информация.
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Заявка не найдена');
  return order;
}

userOrdersRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.customOrder.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: listSelect,
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

userOrdersRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createSchema.parse(req.body ?? {});
    const order = await createCustomOrder({ userId: req.user!.id, ...body });
    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
});

/**
 * Вложение к заявке. Загружается до создания заявки: человек прикладывает исходники и
 * референсы прямо в форме, а ссылки уходят в поле attachments.
 */
userOrdersRouter.post('/attachments', uploadOrderFile, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) throw new HttpError(400, 'FILE_REQUIRED', 'Файл не получен');
    const uploaded = await fileService.uploadOrderAttachment(req.user!.id, file);
    res.status(201).json({ url: uploaded.url });
  } catch (err) {
    next(err);
  }
});

userOrdersRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ order: await ownedOrder(req.user!.id, req.params.id) });
  } catch (err) {
    next(err);
  }
});

userOrdersRouter.post('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await ownedOrder(req.user!.id, req.params.id);
    const body = messageSchema.parse(req.body ?? {});
    await prisma.customOrderMessage.create({
      data: { orderId: order.id, authorId: req.user!.id, fromAdmin: false, body: body.body },
    });
    // Ответ заказчика поднимает заявку в списке админа: она снова требует внимания.
    await prisma.customOrder.update({ where: { id: order.id }, data: { updatedAt: new Date() } });
    res.status(201).json({ order: await ownedOrder(req.user!.id, req.params.id) });
  } catch (err) {
    next(err);
  }
});

userOrdersRouter.post('/:id/pay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await payCustomOrder(req.user!.id, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
