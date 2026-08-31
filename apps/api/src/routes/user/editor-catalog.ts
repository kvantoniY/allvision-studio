import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '@allvision/database';
import { requireAuth } from '../../middleware/auth';
import { HttpError } from '../../utils/http-error';

/**
 * Подборка услуг для панели ИИ в редакторе.
 *
 * Категории и их состав задаёт владелец — прямо в редакторе, не уходя в админку. Хранение
 * в Setting, а не отдельной таблицей: это кураторский список из десятка строк, у него нет
 * ни связей, ни истории, и заводить под него модель с миграцией — лишний вес.
 *
 * Список намеренно не связан с категориями витрины: там разбивка для покупателя, здесь —
 * рабочая полка автора ролика, и в неё можно положить в том числе скрытую услугу.
 */

export const editorCatalogRouter = Router();

editorCatalogRouter.use(requireAuth);

const CATEGORIES_KEY = 'EDITOR_SERVICE_CATEGORIES';

const categorySchema = z.object({
  // Пустой id — новая категория: uuid проставит обработчик записи.
  id: z.string().max(64).optional(),
  title: z.string().trim().min(1).max(80),
  serviceSlugs: z.array(z.string().trim().min(1).max(120)).max(60).default([]),
});

const putSchema = z.object({
  categories: z.array(categorySchema).max(20),
});

export type EditorServiceCategory = {
  id: string;
  title: string;
  serviceSlugs: string[];
};

export async function readEditorCategories(): Promise<EditorServiceCategory[]> {
  const row = await prisma.setting.findUnique({ where: { key: CATEGORIES_KEY } });
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const result = categorySchema.safeParse(item);
        if (!result.success) return null;
        return {
          id: result.data.id || crypto.randomUUID(),
          title: result.data.title,
          serviceSlugs: result.data.serviceSlugs,
        };
      })
      .filter((item): item is EditorServiceCategory => item !== null);
  } catch {
    return [];
  }
}

/**
 * Услуги подборки вместе с обложками и ценой.
 *
 * Отдаём и скрытые услуги: подборка редактора — это выбор владельца, а не витрина. Если
 * он положил сюда услугу, спрятанную с витрины, значит так и задумано.
 */
editorCatalogRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await readEditorCategories();
    const slugs = [...new Set(categories.flatMap((category) => category.serviceSlugs))];
    const services = slugs.length === 0
      ? []
      : await prisma.service.findMany({
        where: { slug: { in: slugs } },
        select: {
          id: true,
          slug: true,
          title: true,
          shortDesc: true,
          description: true,
          previewImage: true,
          coverImage: true,
          previewVideo: true,
          previewMode: true,
          priceCoinsPro: true,
          priceCoinsStandard: true,
          priceTokens: true,
          userInputForm: true,
          isActive: true,
        },
      });

    res.json({ categories, services });
  } catch (err) {
    next(err);
  }
});

/** Правка подборки. Доступна только администратору, хотя читать её может любой автор. */
editorCatalogRouter.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      throw new HttpError(403, 'FORBIDDEN', 'Подборку услуг настраивает администратор');
    }
    const body = putSchema.parse(req.body ?? {});
    const categories: EditorServiceCategory[] = body.categories.map((category) => ({
      id: category.id || crypto.randomUUID(),
      title: category.title,
      serviceSlugs: [...new Set(category.serviceSlugs)],
    }));

    await prisma.setting.upsert({
      where: { key: CATEGORIES_KEY },
      update: { value: JSON.stringify(categories) },
      create: { key: CATEGORIES_KEY, value: JSON.stringify(categories) },
    });
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

/**
 * Все услуги сайта для окна выбора — включая скрытые.
 *
 * Отдельный список только для администратора: обычному автору незачем видеть черновики
 * каталога, а владельцу без них не собрать подборку.
 */
editorCatalogRouter.get('/all-services', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      throw new HttpError(403, 'FORBIDDEN', 'Список всех услуг доступен администратору');
    }
    const services = await prisma.service.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        shortDesc: true,
        previewImage: true,
        coverImage: true,
        isActive: true,
        category: true,
      },
    });
    res.json({ services });
  } catch (err) {
    next(err);
  }
});
