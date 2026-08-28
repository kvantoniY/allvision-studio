import request from 'supertest';
import sharp from 'sharp';
import {
  prisma,
  ProcessingType,
  ProjectStatus,
  type Service,
  type ServiceCategory,
} from '@allvision/database';
import { app } from '../app';
import { signAccessToken } from '../utils/jwt';
import * as fileService from '../services/file-service';
import * as queues from '../queues';

const RUN_ID = Date.now();
const ADMIN_EMAIL = `admin-services-${RUN_ID}@example.ru`;
const USER_EMAIL = `admin-services-user-${RUN_ID}@example.ru`;

let adminUserId: string;
let regularUserId: string;

function authCookie(userId: string, role: 'USER' | 'ADMIN') {
  return [`accessToken=${signAccessToken(userId, role)}`];
}

async function pngBuffer() {
  return sharp({
    create: { width: 32, height: 32, channels: 3, background: '#334455' },
  })
    .png()
    .toBuffer();
}

function validData(slug = `service-${RUN_ID}-${Math.random().toString(16).slice(2)}`) {
  return {
    slug,
    title: `Service ${RUN_ID}`,
    shortDesc: 'Short service description',
    description: 'Long service description',
    category: 'NOSTALGIA',
    priceCoinsStandard: 100,
    priceCoinsPro: 250,
    isActive: true,
    isFeatured: false,
    pipelineConfig: [
      {
        id: 'step_1',
        blockSlug: 'image-restore',
        input: '{{user.photo}}',
        params: {
          model: { standard: 'mock-restore', pro: 'mock-restore' },
          strength: 0.75,
        },
      },
      {
        id: 'step_2',
        blockSlug: 'image-to-video',
        input: '{{step_1.output}}',
        params: {
          model: { standard: 'kling-std', pro: 'kling-pro' },
          duration: 5,
          prompt: 'Animate {{user.photo}}',
        },
      },
    ],
    userInputForm: [
      { id: 'tier', type: 'tier', label: 'Quality', required: true },
      { id: 'photo', type: 'photo', label: 'Photo', required: true },
    ],
  };
}

async function createService(data = validData()): Promise<Service> {
  return prisma.service.create({
    data: {
      slug: data.slug,
      title: data.title,
      shortDesc: data.shortDesc,
      description: data.description,
      category: data.category as ServiceCategory,
      priceTokens: data.priceCoinsStandard,
      costUsd: 0,
      galleryImages: [],
      isActive: data.isActive,
      isFeatured: data.isFeatured,
      sortOrder: 1000 + Math.floor(Math.random() * 1000),
      aiProvider: 'mock',
      aiModel: 'mock-data-driven-pipeline',
      aiConfig: {},
      processingType: ProcessingType.AUTO,
      pipelineConfig: data.pipelineConfig,
      userInputForm: data.userInputForm,
      priceCoinsStandard: data.priceCoinsStandard,
      priceCoinsPro: data.priceCoinsPro,
      previewImage: `http://test.local/static/service-assets/images/${data.slug}-old.png`,
    },
  });
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length > 0) {
    await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.project.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.project.deleteMany({ where: { title: { contains: `Service ${RUN_ID}` } } });
  await prisma.service.deleteMany({
    where: {
      OR: [
        { slug: { contains: `service-${RUN_ID}` } },
        { slug: { contains: `admin-services-${RUN_ID}` } },
      ],
    },
  });
}

beforeAll(async () => {
  await cleanup();
  const [admin, user] = await Promise.all([
    prisma.user.create({
      data: { email: ADMIN_EMAIL, passwordHash: 'hash', role: 'ADMIN', tokenBalance: 1000 },
    }),
    prisma.user.create({
      data: { email: USER_EMAIL, passwordHash: 'hash', role: 'USER', tokenBalance: 1000 },
    }),
  ]);
  adminUserId = admin.id;
  regularUserId = user.id;
});

afterAll(async () => {
  jest.restoreAllMocks();
  await cleanup();
  await prisma.$disconnect();
});

describe('/api/admin/services', () => {
  it('requires auth and admin role', async () => {
    const unauth = await request(app).get('/api/admin/services');
    expect(unauth.status).toBe(401);

    const forbidden = await request(app)
      .get('/api/admin/services')
      .set('Cookie', authCookie(regularUserId, 'USER'));
    expect(forbidden.status).toBe(403);
  });

  it('rejects invalid pipeline block slugs', async () => {
    const data = validData();
    data.pipelineConfig[0].blockSlug = 'missing-block';
    const res = await request(app)
      .post('/api/admin/services')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify(data));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_BLOCK');
  });

  it('rejects duplicate step ids and broken placeholders', async () => {
    const duplicate = validData();
    duplicate.pipelineConfig[1].id = 'step_1';
    const duplicateRes = await request(app)
      .post('/api/admin/services')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify(duplicate));
    expect(duplicateRes.status).toBe(400);
    expect(duplicateRes.body.error.code).toBe('DUPLICATE_STEP_ID');

    const broken = validData();
    broken.pipelineConfig[0].input = '{{step_2.output}}';
    const brokenRes = await request(app)
      .post('/api/admin/services')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify(broken));
    expect(brokenRes.status).toBe(400);
    expect(brokenRes.body.error.code).toBe('INVALID_STEP_REFERENCE');
  });

  it('allows a form without a tier field but rejects two of them', async () => {
    // С P9 услуга живёт и без выбора тарифа: цену берут из priceCoinsPro. А вот два
    // tier-поля — это две разные цены в одной форме, и понять, что спишется, нельзя.
    const noTier = validData(`service-${RUN_ID}-no-tier`);
    noTier.userInputForm = [{ id: 'photo', type: 'photo', label: 'Photo', required: true }];
    const okRes = await request(app)
      .post('/api/admin/services')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify(noTier));
    expect(okRes.status).toBe(201);

    const twoTiers = validData(`service-${RUN_ID}-two-tiers`);
    twoTiers.userInputForm = [
      { id: 'tier', type: 'tier', label: 'Качество', required: true },
      { id: 'tier2', type: 'tier', label: 'Ещё качество', required: true },
    ];
    const res = await request(app)
      .post('/api/admin/services')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify(twoTiers));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TIER_FIELD_DUPLICATE');
  });

  it('returns SERVICE_SLUG_TAKEN for duplicate slugs', async () => {
    const data = validData(`service-${RUN_ID}-taken`);
    await createService(data);
    const res = await request(app)
      .post('/api/admin/services')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify(data));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_SLUG_TAKEN');
  });

  it('creates, lists and reads a service', async () => {
    const data = validData(`service-${RUN_ID}-create`);
    const res = await request(app)
      .post('/api/admin/services')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify(data))
      .attach('previewImage', await pngBuffer(), { filename: 'preview.png', contentType: 'image/png' })
      .attach('previewVideo', Buffer.from('fake video'), { filename: 'preview.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(201);
    expect(res.body.service.slug).toBe(data.slug);
    expect(res.body.service.previewImage).toContain('/static/service-assets/images/');
    expect(res.body.service.previewVideo).toContain('/static/service-assets/videos/');

    const list = await request(app)
      .get('/api/admin/services')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(list.status).toBe(200);
    expect(list.body.items.some((item: Service) => item.id === res.body.service.id)).toBe(true);

    const detail = await request(app)
      .get(`/api/admin/services/${res.body.service.id}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(detail.status).toBe(200);
    expect(detail.body.service.id).toBe(res.body.service.id);
  });

  it('filters services by category, active flag, featured flag and search', async () => {
    const target = await createService({
      ...validData(`service-${RUN_ID}-filtered-target`),
      title: `Service ${RUN_ID} Filtered Target`,
      category: 'TRENDS_MEMES',
      isActive: false,
      isFeatured: true,
    });
    await createService({
      ...validData(`service-${RUN_ID}-filtered-other`),
      title: `Service ${RUN_ID} Filtered Other`,
      category: 'NOSTALGIA',
      isActive: false,
      isFeatured: true,
    });

    const res = await request(app)
      .get('/api/admin/services?category=TRENDS_MEMES&isActive=false&isFeatured=true&search=Filtered')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: Service) => item.id)).toContain(target.id);
    expect(res.body.items.every((item: Service) => item.category === 'TRENDS_MEMES')).toBe(true);
  });

  it('returns 404 for missing service details', async () => {
    const res = await request(app)
      .get('/api/admin/services/missing-service-id')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('rejects invalid block param types', async () => {
    const data = validData(`service-${RUN_ID}-bad-params`);
    data.pipelineConfig[0].params.strength = 'strong' as unknown as number;

    const res = await request(app)
      .post('/api/admin/services')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify(data));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BLOCK_PARAMS');
  });

  it('rejects invalid pipeline updates', async () => {
    const service = await createService(validData(`service-${RUN_ID}-patch-invalid`));
    const nextPipeline = validData().pipelineConfig;
    nextPipeline[0].input = '{{step_2.output}}';

    const res = await request(app)
      .patch(`/api/admin/services/${service.id}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify({ pipelineConfig: nextPipeline }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STEP_REFERENCE');
  });

  it('allows simple status patches for legacy services without pipelineConfig', async () => {
    const legacy = await prisma.service.create({
      data: {
        slug: `service-${RUN_ID}-legacy`,
        title: `Service ${RUN_ID} Legacy`,
        shortDesc: 'Legacy short description',
        description: 'Legacy description',
        category: "NOSTALGIA",
        priceTokens: 100,
        costUsd: 0,
        galleryImages: [],
        isActive: true,
        sortOrder: 3000,
        aiProvider: 'mock',
        aiModel: 'mock-legacy',
        aiConfig: {},
        processingType: ProcessingType.AUTO,
      },
    });

    const res = await request(app)
      .patch(`/api/admin/services/${legacy.id}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify({ isActive: false }));

    expect(res.status).toBe(200);
    expect(res.body.service.isActive).toBe(false);
  });

  it('updates a service and removes the old preview image best-effort', async () => {
    const service = await createService(validData(`service-${RUN_ID}-update`));
    const deleteSpy = jest.spyOn(fileService, 'deleteFile').mockResolvedValue(undefined);
    const res = await request(app)
      .patch(`/api/admin/services/${service.id}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify({ title: 'Updated Service Title' }))
      .attach('previewImage', await pngBuffer(), { filename: 'new-preview.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.service.title).toBe('Updated Service Title');
    expect(deleteSpy).toHaveBeenCalledWith(`service-assets/images/${service.slug}-old.png`);
    deleteSpy.mockRestore();
  });

  it('keeps a preview file that another service still uses', async () => {
    // Дубликат услуги копирует ссылку на обложку, а не файл. Пока на файл кто-то
    // ссылается, удалять его нельзя — иначе обложка пропадёт у оригинала.
    const shared = 'http://test.local/static/service-assets/images/shared-cover.png';
    const first = await createService(validData(`service-${RUN_ID}-shared-a`));
    const second = await createService(validData(`service-${RUN_ID}-shared-b`));
    await prisma.service.updateMany({
      where: { id: { in: [first.id, second.id] } },
      data: { previewImage: shared, coverImage: shared },
    });

    const deleteSpy = jest.spyOn(fileService, 'deleteFile').mockResolvedValue(undefined);
    const res = await request(app)
      .patch(`/api/admin/services/${first.id}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .field('data', JSON.stringify({ title: 'Первая услуга' }))
      .attach('previewImage', await pngBuffer(), { filename: 'new-cover.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(deleteSpy).not.toHaveBeenCalledWith('service-assets/images/shared-cover.png');
    deleteSpy.mockRestore();
  });

  it('blocks delete when active projects exist', async () => {
    const service = await createService(validData(`service-${RUN_ID}-in-use`));
    await prisma.project.create({
      data: {
        userId: adminUserId,
        serviceId: service.id,
        title: `Service ${RUN_ID} active project`,
        status: ProjectStatus.PENDING,
        inputImages: [],
        tokensCost: 0,
      },
    });

    const res = await request(app)
      .delete(`/api/admin/services/${service.id}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SERVICE_IN_USE');
  });

  it('deletes a service without active projects and keeps completed projects through set-null', async () => {
    const service = await createService(validData(`service-${RUN_ID}-delete`));
    const project = await prisma.project.create({
      data: {
        userId: adminUserId,
        serviceId: service.id,
        title: `Service ${RUN_ID} completed project`,
        status: ProjectStatus.COMPLETED,
        inputImages: [],
        tokensCost: 0,
      },
    });

    const res = await request(app)
      .delete(`/api/admin/services/${service.id}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(res.status).toBe(200);
    const keptProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(keptProject.serviceId).toBeNull();
  });

  it('returns 404 when deleting a missing service', async () => {
    const res = await request(app)
      .delete('/api/admin/services/missing-service-id')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('reorders services inside the same category', async () => {
    const first = await createService({ ...validData(`service-${RUN_ID}-first`), title: `Service ${RUN_ID} First` });
    const second = await createService({ ...validData(`service-${RUN_ID}-second`), title: `Service ${RUN_ID} Second` });
    await prisma.service.update({ where: { id: first.id }, data: { sortOrder: -20 } });
    await prisma.service.update({ where: { id: second.id }, data: { sortOrder: -10 } });

    const moved = await request(app)
      .post(`/api/admin/services/${second.id}/reorder`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .send({ direction: 'up' });
    expect(moved.status).toBe(200);
    expect(moved.body.moved).toBe(true);

    const [updatedFirst, updatedSecond] = await Promise.all([
      prisma.service.findUniqueOrThrow({ where: { id: first.id } }),
      prisma.service.findUniqueOrThrow({ where: { id: second.id } }),
    ]);
    expect(updatedSecond.sortOrder).toBe(-20);
    expect(updatedFirst.sortOrder).toBe(-10);

    const edge = await request(app)
      .post(`/api/admin/services/${second.id}/reorder`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .send({ direction: 'up' });
    expect(edge.status).toBe(200);
    expect(edge.body.moved).toBe(false);
  });

  it('duplicates a service as inactive copy', async () => {
    const service = await createService(validData(`service-${RUN_ID}-duplicate`));
    const res = await request(app)
      .post(`/api/admin/services/${service.id}/duplicate`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.service.slug).toBe(`${service.slug}-copy`);
    expect(res.body.service.isActive).toBe(false);
  });

  it('marks admin test-run jobs as test-run mode so worker never uses PiAPI', async () => {
    const service = await createService(validData(`service-${RUN_ID}-test-run`));
    const queueSpy = jest
      .spyOn(queues, 'addServicePipelineJob')
      .mockResolvedValue(undefined as never);

    const res = await request(app)
      .post(`/api/admin/services/${service.id}/test-run`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'))
      .send({ selectedTier: 'standard' });

    expect(res.status).toBe(202);
    expect(queueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: adminUserId,
        mode: 'test-run',
      }),
    );
    queueSpy.mockRestore();
  });

  it('increments duplicate slug suffix when copy already exists', async () => {
    const service = await createService(validData(`service-${RUN_ID}-duplicate-collision`));
    await createService({ ...validData(`${service.slug}-copy`), title: `Service ${RUN_ID} Existing Copy` });

    const res = await request(app)
      .post(`/api/admin/services/${service.id}/duplicate`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.service.slug).toBe(`${service.slug}-copy-2`);
    expect(res.body.service.isActive).toBe(false);
  });

  it('returns 404 when duplicating a missing service', async () => {
    const res = await request(app)
      .post('/api/admin/services/missing-service-id/duplicate')
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SERVICE_NOT_FOUND');
  });
});
