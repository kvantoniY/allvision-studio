import request from 'supertest';
import { prisma, ProcessingType, type Service } from '@allvision/database';
import { app } from '../app';

const RUN_ID = Date.now();

function serviceData(slug: string, category = "NOSTALGIA", isActive = true, isFeatured = false) {
  return {
    slug,
    title: `Public service ${RUN_ID} ${slug}`,
    shortDesc: 'Short public description',
    description: 'Long public description',
    category,
    priceTokens: 100,
    priceCoinsStandard: 100,
    priceCoinsPro: 250,
    costUsd: 0,
    coverImage: 'http://test.local/static/service-assets/images/public.jpg',
    galleryImages: [],
    previewImage: 'http://test.local/static/service-assets/images/public-preview.jpg',
    previewVideo: 'http://test.local/static/service-assets/videos/public-preview.mp4',
    isActive,
    isFeatured,
    sortOrder: 100,
    aiProvider: 'mock',
    aiModel: 'mock-data-driven-pipeline',
    aiConfig: {},
    processingType: ProcessingType.AUTO,
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-restore',
        input: '{{user.photo}}',
        params: { model: { standard: 'mock-restore', pro: 'mock-restore' } },
      },
    ],
    userInputForm: [
      { id: 'photo', type: 'photo', label: 'Photo', required: true },
      { id: 'tier', type: 'tier', label: 'Quality', required: true },
    ],
  };
}

async function createService(
  slug = `public-service-${RUN_ID}-${Math.random().toString(16).slice(2)}`,
  category = "NOSTALGIA",
  isActive = true,
  isFeatured = false,
): Promise<Service> {
  return prisma.service.create({ data: serviceData(slug, category, isActive, isFeatured) });
}

async function cleanup() {
  await prisma.service.deleteMany({ where: { slug: { contains: `public-service-${RUN_ID}` } } });
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('GET /api/services', () => {
  it('returns active gift services without pipelineConfig', async () => {
    const active = await createService(`public-service-${RUN_ID}-active`, "NOSTALGIA", true, true);
    await createService(`public-service-${RUN_ID}-inactive`, "NOSTALGIA", false, false);
    await createService(`public-service-${RUN_ID}-legacy`, "PHOTO_RESTORE", true, false);

    const res = await request(app).get('/api/services');

    expect(res.status).toBe(200);
    expect(res.body.services.map((item: Service) => item.id)).toContain(active.id);
    expect(res.body.services.some((item: Service) => item.slug.endsWith('inactive'))).toBe(false);
    expect(res.body.services.some((item: Service) => item.slug.endsWith('legacy'))).toBe(false);
    expect(res.body.services[0]).not.toHaveProperty('pipelineConfig');
  });

  it('filters by category and featured flag', async () => {
    const target = await createService(`public-service-${RUN_ID}-featured-trend`, "TRENDS_MEMES", true, true);
    await createService(`public-service-${RUN_ID}-featured-nostalgia`, "NOSTALGIA", true, true);

    const res = await request(app).get('/api/services?category=TRENDS_MEMES&featured=true');

    expect(res.status).toBe(200);
    expect(res.body.services.map((item: Service) => item.id)).toContain(target.id);
    expect(res.body.services.every((item: Service) => item.category === 'TRENDS_MEMES')).toBe(true);
    expect(res.body.services.every((item: Service) => item.isFeatured === true)).toBe(true);
  });
});

describe('GET /api/services/:slug', () => {
  it('returns public detail for guests with userInputForm and without pipelineConfig', async () => {
    const service = await createService(`public-service-${RUN_ID}-detail`);

    const res = await request(app).get(`/api/services/${service.slug}`);

    expect(res.status).toBe(200);
    expect(res.body.service.slug).toBe(service.slug);
    expect(res.body.service.userInputForm).toEqual(expect.any(Array));
    expect(res.body.service).not.toHaveProperty('pipelineConfig');
  });

  it('returns 404 for inactive services', async () => {
    const service = await createService(`public-service-${RUN_ID}-hidden`, "NOSTALGIA", false);

    const res = await request(app).get(`/api/services/${service.slug}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_NOT_FOUND');
  });
});
