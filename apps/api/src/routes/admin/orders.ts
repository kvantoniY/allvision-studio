import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@allvision/database';
import {
  CUSTOM_ORDER_STATUSES,
  briefFieldsSchema,
  orderEmailTemplatesSchema,
} from '@allvision/shared';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';
import { changeOrderStatus } from '../../services/order-service';

export const adminOrdersRouter = Router();
export const adminOrderTypesRouter = Router();

adminOrdersRouter.use(requireAuth, requireAdmin);
adminOrderTypesRouter.use(requireAuth, requireAdmin);

// ---------- Типы заказов ----------

const orderTypeSchema = z.object({
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(140),
  shortDesc: z.string().trim().min(1).max(280),
  description: z.string().trim().min(1).max(6000),
  coverImage: z.string().trim().max(2000).nullable().optional(),
  previewVideo: z.string().trim().max(2000).nullable().optional(),
  briefFields: briefFieldsSchema,
  priceFromCoins: z.coerce.number().int().min(1),
  priceToCoins: z.coerce.number().int().min(1),
  leadTimeDays: z.coerce.number().int().min(1).max(90).optional(),
  emailTemplates: orderEmailTemplatesSchema,
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

const orderTypeUpdateSchema = orderTypeSchema.omit({ slug: true }).partial();

adminOrderTypesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.orderTypeDef.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const counts = await prisma.customOrder.groupBy({ by: ['orderTypeId'], _count: { _all: true } });
    const byType = new Map(counts.map((row) => [row.orderTypeId, row._count._all]));
    res.json({ items: items.map((item) => ({ ...item, ordersCount: byType.get(item.id) ?? 0 })) });
  } catch (err) {
    next(err);
  }
});

adminOrderTypesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = orderTypeSchema.parse(req.body ?? {});
    if (body.priceToCoins < body.priceFromCoins) {
      throw new HttpError(400, 'INVALID_PRICE_RANGE', 'Верхняя граница цены меньше нижней');
    }
    const exists = await prisma.orderTypeDef.findUnique({ where: { slug: body.slug }, select: { id: true } });
    if (exists) throw new HttpError(409, 'SLUG_TAKEN', 'Такой слаг уже занят');

    const item = await prisma.orderTypeDef.create({
      data: {
        ...body,
        coverImage: body.coverImage ?? null,
        previewVideo: body.previewVideo ?? null,
        briefFields: body.briefFields as never,
        emailTemplates: (body.emailTemplates ?? null) as never,
      },
    });
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

adminOrderTypesRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = orderTypeUpdateSchema.parse(req.body ?? {});
    const current = await prisma.orderTypeDef.findUnique({ where: { id: req.params.id } });
    if (!current) throw new HttpError(404, 'ORDER_TYPE_NOT_FOUND', 'Тип заказа не найден');

    const from = body.priceFromCoins ?? current.priceFromCoins;
    const to = body.priceToCoins ?? current.priceToCoins;
    if (to < from) throw new HttpError(400, 'INVALID_PRICE_RANGE', 'Верхняя граница цены меньше нижней');

    const item = await prisma.orderTypeDef.update({
      where: { id: current.id },
      data: {
        ...body,
        ...(body.briefFields ? { briefFields: body.briefFields as never } : {}),
        ...(body.emailTemplates !== undefined ? { emailTemplates: (body.emailTemplates ?? null) as never } : {}),
      },
    });
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

adminOrderTypesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const active = await prisma.customOrder.count({
      where: { orderTypeId: req.params.id, status: { in: ['NEW', 'QUOTED', 'PAID', 'IN_PROGRESS'] } },
    });
    if (active > 0) {
      throw new HttpError(409, 'ORDER_TYPE_IN_USE', `По этому типу ${active} активных заявок — сначала закройте их`);
    }
    await prisma.orderTypeDef.deleteMany({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------- Заявки ----------

const listQuerySchema = z.object({
  status: z.enum(CUSTOM_ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const statusSchema = z.object({
  status: z.enum(CUSTOM_ORDER_STATUSES),
  note: z.string().trim().max(4000).optional(),
  quotedPriceCoins: z.coerce.number().int().min(1).optional(),
  resultUrl: z.string().trim().max(2000).optional(),
});

const replySchema = z.object({ body: z.string().trim().min(1).max(4000) });

adminOrdersRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await prisma.$transaction([
      prisma.customOrder.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          typeTitle: true,
          status: true,
          quotedPriceCoins: true,
          contactName: true,
          contactEmail: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, email: true } },
        },
      }),
      prisma.customOrder.count({ where }),
    ]);
    res.json({ items, total, page: query.page, limit: query.limit });
  } catch (err) {
    next(err);
  }
});

adminOrdersRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.customOrder.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, email: true, name: true, tokenBalance: true } },
        orderType: { select: { id: true, slug: true, title: true, briefFields: true, priceFromCoins: true, priceToCoins: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Заявка не найдена');
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

adminOrdersRouter.post('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = statusSchema.parse(req.body ?? {});
    const result = await changeOrderStatus({
      orderId: req.params.id,
      next: body.status,
      adminId: req.user!.id,
      note: body.note,
      quotedPriceCoins: body.quotedPriceCoins,
      resultUrl: body.resultUrl,
    });
    res.json({ order: result });
  } catch (err) {
    next(err);
  }
});

adminOrdersRouter.post('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = replySchema.parse(req.body ?? {});
    const order = await prisma.customOrder.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Заявка не найдена');
    await prisma.customOrderMessage.create({
      data: { orderId: order.id, authorId: req.user!.id, fromAdmin: true, body: body.body },
    });
    await prisma.customOrder.update({ where: { id: order.id }, data: { updatedAt: new Date() } });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
