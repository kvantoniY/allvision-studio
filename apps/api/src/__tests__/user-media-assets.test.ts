import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { prisma } from '@allvision/database';
import { getBlockCatalogItem } from '@allvision/shared';
import { app } from '../app';
import { _resetProvidersForTests } from '../providers';
import { signAccessToken } from '../utils/jwt';
import * as queuesModule from '../queues';

const RUN_ID = Date.now();
const USER_EMAIL = `library-user-${RUN_ID}@example.ru`;
const OTHER_EMAIL = `library-other-${RUN_ID}@example.ru`;
const ADMIN_EMAIL = `library-admin-${RUN_ID}@example.ru`;

let tmpDir: string;
let originalUploads: string | undefined;
let originalApiUrl: string | undefined;
let userId: string;
let otherUserId: string;
let adminUserId: string;

function authCookie(id: string, role: 'USER' | 'ADMIN' = 'USER') {
  return [`accessToken=${signAccessToken(id, role)}`];
}

async function pngBuffer() {
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: '#8855ff' },
  }).png().toBuffer();
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [USER_EMAIL, OTHER_EMAIL, ADMIN_EMAIL] } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  if (ids.length > 0) {
    await prisma.tokenTransaction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.project.deleteMany({ where: { userId: { in: ids } } });
    await prisma.mediaAsset.deleteMany({ where: { ownerUserId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.mediaAsset.deleteMany({ where: { title: { contains: `Library ${RUN_ID}` } } });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-media-assets-test-'));
  originalUploads = process.env.UPLOADS_DIR;
  originalApiUrl = process.env.PUBLIC_API_URL;
  process.env.UPLOADS_DIR = tmpDir;
  process.env.PUBLIC_API_URL = 'http://test.local:4000';
  _resetProvidersForTests();
  await cleanup();
  const [user, other, admin] = await Promise.all([
    prisma.user.create({ data: { email: USER_EMAIL, passwordHash: 'hash', tokenBalance: 100 } }),
    prisma.user.create({ data: { email: OTHER_EMAIL, passwordHash: 'hash', tokenBalance: 100 } }),
    prisma.user.create({ data: { email: ADMIN_EMAIL, passwordHash: 'hash', role: 'ADMIN', tokenBalance: 0 } }),
  ]);
  userId = user.id;
  otherUserId = other.id;
  adminUserId = admin.id;
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await cleanup();
  process.env.UPLOADS_DIR = originalUploads;
  process.env.PUBLIC_API_URL = originalApiUrl;
  _resetProvidersForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('/api/user/media-assets', () => {
  it('creates, lists, updates, protects ownership and deletes user assets', async () => {
    const create = await request(app)
      .post('/api/user/media-assets')
      .set('Cookie', authCookie(userId))
      .field('data', JSON.stringify({ kind: 'user-avatar', title: `Library ${RUN_ID} avatar`, tags: 'hero,face' }))
      .attach('file', await pngBuffer(), { filename: 'avatar.png', contentType: 'image/png' });

    expect(create.status).toBe(201);
    expect(create.body.asset.ownerUserId).toBe(userId);
    expect(create.body.asset.kind).toBe('user-avatar');
    const id = create.body.asset.id as string;

    const list = await request(app)
      .get(`/api/user/media-assets?kind=user-avatar&tag=hero&search=${RUN_ID}`)
      .set('Cookie', authCookie(userId));
    expect(list.status).toBe(200);
    expect(list.body.items.map((asset: { id: string }) => asset.id)).toContain(id);

    const hidden = await request(app)
      .get(`/api/user/media-assets/${id}`)
      .set('Cookie', authCookie(otherUserId));
    expect(hidden.status).toBe(404);

    const update = await request(app)
      .patch(`/api/user/media-assets/${id}`)
      .set('Cookie', authCookie(userId))
      .send({ title: `Library ${RUN_ID} renamed`, tags: ['updated'] });
    expect(update.status).toBe(200);
    expect(update.body.asset.title).toContain('renamed');

    const remove = await request(app)
      .delete(`/api/user/media-assets/${id}`)
      .set('Cookie', authCookie(userId));
    expect(remove.status).toBe(200);
  });

  it('is visible to admin but hidden from public media assets', async () => {
    const asset = await prisma.mediaAsset.create({
      data: {
        ownerUserId: userId,
        kind: 'user-location',
        title: `Library ${RUN_ID} private location`,
        tags: [],
        storageKey: `media-assets/user-location/${RUN_ID}.jpg`,
        publicUrl: `http://test.local:4000/static/media-assets/user-location/${RUN_ID}.jpg`,
        fileSize: 10,
        mimeType: 'image/jpeg',
        isActive: true,
      },
    });

    const admin = await request(app)
      .get(`/api/admin/media-assets?kind=user-location&search=${RUN_ID}`)
      .set('Cookie', authCookie(adminUserId, 'ADMIN'));
    expect(admin.status).toBe(200);
    expect(admin.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: asset.id,
          ownerUserId: userId,
          owner: expect.objectContaining({ email: USER_EMAIL }),
        }),
      ]),
    );

    const publicRes = await request(app).get('/api/public/media-assets?kind=user-location');
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.assets.map((item: { id: string }) => item.id)).not.toContain(asset.id);
  });

  it('creates a library-generation project and charges the user', async () => {
    const addJob = jest.spyOn(queuesModule, 'addServicePipelineJob').mockResolvedValue({} as never);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const cost = getBlockCatalogItem('image-edit')?.supportedModels.find((model) => model.slug === 'nano-banana')?.estimatedCostCoins ?? 10;

    const res = await request(app)
      .post('/api/user/media-assets/generate')
      .set('Cookie', authCookie(userId))
      .send({
        kind: 'user-avatar',
        title: `Library ${RUN_ID} generated`,
        prompt: 'A warm cinematic portrait of a friendly person',
        model: 'nano-banana',
        aspectRatio: '1:1',
      });

    expect(res.status).toBe(202);
    expect(addJob).toHaveBeenCalledWith({ projectId: res.body.project.id, userId, mode: 'production' });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.body.project.id } });
    expect(project.mode).toBe('library-generation');
    expect(project.pipelineSnapshot).toEqual(expect.arrayContaining([expect.objectContaining({ blockSlug: 'image-edit' })]));

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.tokenBalance).toBe(before.tokenBalance - cost);
  });

  it('refunds when library-generation cannot be queued', async () => {
    jest.spyOn(queuesModule, 'addServicePipelineJob').mockRejectedValue(new Error('queue down'));
    const before = await prisma.user.findUniqueOrThrow({ where: { id: otherUserId } });

    const res = await request(app)
      .post('/api/user/media-assets/generate')
      .set('Cookie', authCookie(otherUserId))
      .send({
        kind: 'user-location',
        title: `Library ${RUN_ID} failed queue`,
        prompt: 'A bright cozy room with soft window light',
        model: 'nano-banana',
      });

    expect(res.status).toBe(503);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: otherUserId } });
    expect(after.tokenBalance).toBe(before.tokenBalance);
    const refund = await prisma.tokenTransaction.findFirst({
      where: { userId: otherUserId, reason: 'refund' },
      orderBy: { createdAt: 'desc' },
    });
    expect(refund?.amount).toBeGreaterThan(0);
  });

  it('saves a completed project output to the user library and validates project access', async () => {
    const projectId = `save-project-${RUN_ID}`;
    const outputKey = `results/${projectId}/output.png`;
    const outputPath = path.join(tmpDir, outputKey);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, await pngBuffer());

    await prisma.project.create({
      data: {
        id: projectId,
        userId,
        mode: 'free-chat',
        title: `Library ${RUN_ID} completed project`,
        status: 'COMPLETED',
        progress: 100,
        inputImages: [],
        tokensCost: 10,
        resultImage: `http://test.local:4000/static/${outputKey}`,
      },
    });
    const pending = await prisma.project.create({
      data: {
        userId,
        mode: 'service',
        title: `Library ${RUN_ID} pending project`,
        status: 'PENDING',
        progress: 0,
        inputImages: [],
        tokensCost: 10,
      },
    });
    const foreign = await prisma.project.create({
      data: {
        userId: otherUserId,
        mode: 'free-chat',
        title: `Library ${RUN_ID} foreign project`,
        status: 'COMPLETED',
        progress: 100,
        inputImages: [],
        tokensCost: 10,
        resultImage: `http://test.local:4000/static/${outputKey}`,
      },
    });

    const foreignRes = await request(app)
      .post('/api/user/media-assets/save-from-project')
      .set('Cookie', authCookie(userId))
      .send({ projectId: foreign.id, kind: 'user-avatar', title: `Library ${RUN_ID} denied` });
    expect(foreignRes.status).toBe(404);

    const pendingRes = await request(app)
      .post('/api/user/media-assets/save-from-project')
      .set('Cookie', authCookie(userId))
      .send({ projectId: pending.id, kind: 'user-avatar', title: `Library ${RUN_ID} pending denied` });
    expect(pendingRes.status).toBe(400);
    expect(pendingRes.body.error.code).toBe('PROJECT_NOT_COMPLETED');

    const res = await request(app)
      .post('/api/user/media-assets/save-from-project')
      .set('Cookie', authCookie(userId))
      .send({
        projectId,
        kind: 'user-avatar',
        title: `Library ${RUN_ID} saved from project`,
        tags: ['saved', 'project'],
      });

    expect(res.status).toBe(201);
    expect(res.body.asset.ownerUserId).toBe(userId);
    expect(res.body.asset.kind).toBe('user-avatar');
    expect(res.body.asset.storageKey).toContain(`user-uploads/library/${userId}/`);
    expect(res.body.asset.tags).toEqual(expect.arrayContaining(['saved', 'project', 'from-project', `project:${projectId}`]));
    expect(fs.existsSync(path.join(tmpDir, res.body.asset.storageKey))).toBe(true);
  });
});
