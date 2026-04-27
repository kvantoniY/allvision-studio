import { Router, type NextFunction, type Request, type Response } from 'express';
import { contactSchema } from '@allvision/shared';
import type {
  PublicServiceResponse,
  PublicServicesResponse,
  PublicSettingsResponse,
  PublicTokenPackagesResponse,
  PublicTrend,
  PublicTrendResponse,
  PublicTrendsResponse,
  ContactResponse,
  PublicSettings,
} from '@allvision/shared';
import { prisma } from '@allvision/database';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';

export const publicRouter = Router();

const publicServiceSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  shortDesc: true,
  category: true,
  priceTokens: true,
  coverImage: true,
  galleryImages: true,
  processingType: true,
  sortOrder: true,
};

const publicTrendSelect = {
  id: true,
  title: true,
  description: true,
  previewVideo: true,
  referenceImg: true,
  prompt: true,
  tags: true,
  priceTokens: true,
  sortOrder: true,
  viewsCount: true,
  usedCount: true,
  serviceId: true,
  service: { select: { priceTokens: true } },
};

type PublicTrendRow = Omit<PublicTrend, 'priceTokens'> & {
  priceTokens: number | null;
  service: { priceTokens: number };
};

function toPublicTrend(trend: PublicTrendRow): PublicTrend {
  const { service, ...publicTrend } = trend;
  return {
    ...publicTrend,
    priceTokens: trend.priceTokens ?? service.priceTokens,
  };
}

const publicSettingMap = {
  support_telegram: 'supportTelegram',
  support_email: 'supportEmail',
  company_name: 'companyName',
  fairy_tale_tier_basic_price: 'fairyTaleTierBasicPrice',
  fairy_tale_tier_extended_price: 'fairyTaleTierExtendedPrice',
  cartoon_base_rate_per_minute: 'cartoonBaseRatePerMinute',
  realistic_base_rate_per_minute: 'realisticBaseRatePerMinute',
} as const;

publicRouter.get('/services', async (_req: Request, res: Response<PublicServicesResponse>, next: NextFunction) => {
  try {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: publicServiceSelect,
    });
    res.json({ services });
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/services/:slug', async (req: Request, res: Response<PublicServiceResponse>, next: NextFunction) => {
  try {
    const service = await prisma.service.findFirst({
      where: { slug: req.params.slug, isActive: true },
      select: publicServiceSelect,
    });
    if (!service) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Услуга не найдена');
    res.json({ service });
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/trends', async (req: Request, res: Response<PublicTrendsResponse>, next: NextFunction) => {
  try {
    const tags = String(req.query.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const trends = await prisma.trend.findMany({
      where: {
        isActive: true,
        ...(tags.length ? { tags: { hasEvery: tags } } : {}),
      },
      orderBy: { sortOrder: 'asc' },
      select: publicTrendSelect,
    });
    res.json({ trends: trends.map(toPublicTrend) });
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/trends/:id', async (req: Request, res: Response<PublicTrendResponse>, next: NextFunction) => {
  try {
    const trend = await prisma.trend.findFirst({
      where: { id: req.params.id, isActive: true },
      select: publicTrendSelect,
    });
    if (!trend) throw new HttpError(404, 'TREND_NOT_FOUND', 'Тренд не найден');
    res.json({ trend: toPublicTrend(trend) });
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/token-packages', async (_req: Request, res: Response<PublicTokenPackagesResponse>, next: NextFunction) => {
  try {
    const packages = await prisma.tokenPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        tokens: true,
        priceRub: true,
        bonus: true,
        isPopular: true,
        sortOrder: true,
      },
    });
    res.json({ packages });
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/settings/public', async (_req: Request, res: Response<PublicSettingsResponse>, next: NextFunction) => {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: Object.keys(publicSettingMap) } },
    });

    const settings: PublicSettings = {
      supportTelegram: '@allvision_support',
      supportEmail: 'hello@allvision.studio',
      companyName: 'Allvision Studio',
      fairyTaleTierBasicPrice: '4990',
      fairyTaleTierExtendedPrice: '7990',
      cartoonBaseRatePerMinute: '3000',
      realisticBaseRatePerMinute: '6000',
    };

    for (const row of rows) {
      const publicKey = publicSettingMap[row.key as keyof typeof publicSettingMap];
      if (publicKey) settings[publicKey] = row.value;
    }

    res.json({ settings });
  } catch (e) {
    next(e);
  }
});

publicRouter.post('/contact', async (req: Request, res: Response<ContactResponse>, next: NextFunction) => {
  try {
    const data = contactSchema.parse(req.body);
    logger.info('Public contact request received', data);
    res.status(202).json({ ok: true });
  } catch (e) {
    next(e);
  }
});
