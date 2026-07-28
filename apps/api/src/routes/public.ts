import { Router, type NextFunction, type Request, type Response } from 'express';
import { contactSchema } from '@allvision/shared';
import type {
  PublicServiceResponse,
  PublicServicesResponse,
  PublicSettingsResponse,
  PublicScenarioTemplate,
  PublicScenarioTemplateResponse,
  PublicScenarioTemplatesResponse,
  PublicTokenPackagesResponse,
  PublicTrend,
  PublicTrendResponse,
  PublicTrendsResponse,
  ContactResponse,
  PublicSettings,
  PublicMediaAssetsResponse,
  PublicServiceCategoriesResponse,
} from '@allvision/shared';
import { prisma } from '@allvision/database';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { requireCaptcha } from '../middleware/captcha';

export const publicRouter = Router();

const publicServiceSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  shortDesc: true,
  category: true,
  priceTokens: true,
  priceCoinsStandard: true,
  priceCoinsPro: true,
  coverImage: true,
  galleryImages: true,
  previewImage: true,
  previewVideo: true,
  previewMode: true,
  isFeatured: true,
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

const publicScenarioTemplateSelect = {
  id: true,
  slug: true,
  title: true,
  shortDesc: true,
  description: true,
  category: true,
  previewVideo: true,
  previewImage: true,
  promptTemplate: true,
  characterRoles: true,
  needsScene: true,
  recommendedDuration: true,
  defaultStyle: true,
  priceTokens: true,
  tags: true,
  popularityScore: true,
  isFeatured: true,
  sortOrder: true,
};

function staticUrlForKey(key: string | null | undefined) {
  if (!key) return null;
  const baseUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:4000';
  return `${baseUrl.replace(/\/+$/, '')}/static/${key.replace(/^\/+/, '')}`;
}

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

function toPublicScenarioTemplate(template: {
  characterRoles: unknown;
} & Omit<PublicScenarioTemplate, 'characterRoles'>): PublicScenarioTemplate {
  const roles = Array.isArray(template.characterRoles) ? template.characterRoles : [];
  return {
    ...template,
    characterRoles: roles
      .filter((role): role is PublicScenarioTemplate['characterRoles'][number] =>
        Boolean(role && typeof role === 'object' && 'role' in role && 'label' in role),
      )
      .map((role) => ({
        role: String(role.role),
        label: String(role.label),
        required: Boolean(role.required),
      })),
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

const HOME_PAGE_CONTENT_KEY = 'home_page_content_v1';

function parseHomePageContent(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    logger.warn('Failed to parse public home page content setting', { err });
    return null;
  }
}

publicRouter.get('/service-categories', async (_req: Request, res: Response<PublicServiceCategoriesResponse>, next: NextFunction) => {
  try {
    const categories = await prisma.serviceCategoryDef.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: {
        code: true,
        title: true,
        description: true,
        shortDescription: true,
        iconName: true,
        sortOrder: true,
        isActive: true,
        isFeatured: true,
      },
    });
    res.json({ categories });
  } catch (e) {
    next(e);
  }
});

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

publicRouter.get('/media-assets', async (req: Request, res: Response<PublicMediaAssetsResponse>, next: NextFunction) => {
  try {
    const kind = typeof req.query.kind === 'string' ? req.query.kind.trim() : undefined;
    const group = typeof req.query.group === 'string' && req.query.group.trim() ? req.query.group.trim() : undefined;
    const active = req.query.active === undefined ? true : req.query.active === 'true';
    const assets = await prisma.mediaAsset.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(group ? { groupCode: group } : {}),
        ...(active ? { isActive: true } : {}),
        ownerUserId: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        kind: true,
        groupCode: true,
        title: true,
        description: true,
        tags: true,
        publicUrl: true,
        thumbnailKey: true,
        durationSec: true,
        width: true,
        height: true,
        fileSize: true,
        mimeType: true,
        sortOrder: true,
      },
    });
    res.json({
      assets: assets.map((asset) => ({
        ...asset,
        thumbnailUrl: staticUrlForKey(asset.thumbnailKey),
      })),
    });
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/home-page', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await prisma.setting.findUnique({ where: { key: HOME_PAGE_CONTENT_KEY } });
    res.json({ content: parseHomePageContent(row?.value) });
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/style-presets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kind = typeof req.query.kind === 'string' ? req.query.kind.trim() : undefined;
    if (kind && kind !== 'user-avatar' && kind !== 'user-location') {
      throw new HttpError(400, 'INVALID_STYLE_PRESET_KIND', 'Неизвестный тип шаблона');
    }
    const presets = await prisma.stylePreset.findMany({
      where: {
        isActive: true,
        ...(kind ? { kind } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true,
        slug: true,
        kind: true,
        title: true,
        description: true,
        promptText: true,
        thumbnail: true,
        sortOrder: true,
      },
    });
    res.json({ presets });
  } catch (e) {
    next(e);
  }
});

publicRouter.get(
  '/scenario-templates',
  async (req: Request, res: Response<PublicScenarioTemplatesResponse>, next: NextFunction) => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const isFeatured = req.query.isFeatured === 'true' ? true : undefined;

      const templates = await prisma.scenarioTemplate.findMany({
        where: {
          isActive: true,
          ...(category ? { category } : {}),
          ...(isFeatured === true ? { isFeatured: true } : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        select: publicScenarioTemplateSelect,
      });

      res.json({ templates: templates.map(toPublicScenarioTemplate) });
    } catch (e) {
      next(e);
    }
  },
);

publicRouter.get(
  '/scenario-templates/:slug',
  async (req: Request, res: Response<PublicScenarioTemplateResponse>, next: NextFunction) => {
    try {
      const template = await prisma.scenarioTemplate.findFirst({
        where: { slug: req.params.slug, isActive: true },
        select: publicScenarioTemplateSelect,
      });
      if (!template) {
        throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'Шаблон сценария не найден');
      }
      res.json({ template: toPublicScenarioTemplate(template) });
    } catch (e) {
      next(e);
    }
  },
);

publicRouter.get('/token-packages', async (_req: Request, res: Response<PublicTokenPackagesResponse>, next: NextFunction) => {
  try {
    const packages = await prisma.tokenPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        subtitle: true,
        tokens: true,
        priceRub: true,
        originalPriceRub: true,
        bonus: true,
        badgeText: true,
        features: true,
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
      supportEmail: 'allvision_ai@internet.ru',
      companyName: 'Allvision Academy',
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

publicRouter.post('/contact', requireCaptcha(), async (req: Request, res: Response<ContactResponse>, next: NextFunction) => {
  try {
    const data = contactSchema.parse(req.body);
    logger.info('Public contact request received', data);
    res.status(202).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// === Academy: витрина преподавателей и программ (для лендинга и карточки профиля) ===
// Публично отдаём только то, что преподаватель сам показывает родителям:
// имя, фото, био, предметы и число проведённых занятий. Почты и id пользователя нет.

publicRouter.get('/academy/teachers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const teachers = await prisma.teacherProfile.findMany({
      where: { isActive: true },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
      take: 24,
    });
    const completed = new Map(
      (await prisma.lesson.groupBy({
        by: ['teacherId'],
        where: { status: { in: ['COMPLETED', 'REPORT_SENT'] } },
        _count: { _all: true },
      })).map((row) => [row.teacherId, row._count._all]),
    );
    const courseIds = [...new Set(teachers.flatMap((t) => t.courseIds))];
    const courses = courseIds.length > 0
      ? await prisma.course.findMany({
        where: { id: { in: courseIds }, isActive: true },
        select: { id: true, title: true, subject: { select: { title: true } } },
      })
      : [];
    const courseById = new Map(courses.map((c) => [c.id, { id: c.id, title: c.title, subjectTitle: c.subject.title }]));

    res.json({
      teachers: teachers.map((t) => ({
        teacherId: t.id,
        name: t.user.name ?? t.user.email.split('@')[0],
        bio: t.bio,
        photoUrl: t.photoUrl,
        subjects: t.subjects,
        lessonsCount: t.lessonsManual ?? completed.get(t.id) ?? 0,
        courses: t.courseIds.map((id) => courseById.get(id)).filter(Boolean),
      })),
    });
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/academy/teachers/:teacherId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teacher = await prisma.teacherProfile.findFirst({
      where: { id: req.params.teacherId, isActive: true },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!teacher) throw new HttpError(404, 'TEACHER_NOT_FOUND', 'Преподаватель не найден');
    const completed = await prisma.lesson.count({
      where: { teacherId: teacher.id, status: { in: ['COMPLETED', 'REPORT_SENT'] } },
    });
    const courses = teacher.courseIds.length > 0
      ? await prisma.course.findMany({
        where: { id: { in: teacher.courseIds }, isActive: true },
        select: { id: true, title: true, level: true, subject: { select: { title: true } } },
      })
      : [];
    // Есть ли у преподавателя свободные слоты — от этого зависит CTA «Записаться».
    const freeSlots = await prisma.teacherSlot.count({
      where: { teacherId: teacher.id, isBooked: false, startsAt: { gt: new Date() } },
    });

    res.json({
      teacherId: teacher.id,
      name: teacher.user.name ?? teacher.user.email.split('@')[0],
      bio: teacher.bio,
      photoUrl: teacher.photoUrl,
      subjects: teacher.subjects,
      lessonsCount: teacher.lessonsManual ?? completed,
      freeSlots,
      courses: courses.map((c) => ({ id: c.id, title: c.title, level: c.level, subjectTitle: c.subject.title })),
    });
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/academy/programs', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const subjects = await prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        courses: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, title: true, level: true, ageMin: true, ageMax: true, description: true,
            _count: { select: { modules: true } },
          },
        },
      },
    });
    res.json({
      subjects: subjects
        .filter((s) => s.courses.length > 0)
        .map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          courses: s.courses.map((c) => ({
            id: c.id,
            title: c.title,
            level: c.level,
            ageMin: c.ageMin,
            ageMax: c.ageMax,
            description: c.description,
            moduleCount: c._count.modules,
          })),
        })),
    });
  } catch (e) {
    next(e);
  }
});
