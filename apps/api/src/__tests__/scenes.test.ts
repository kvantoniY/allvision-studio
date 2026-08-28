import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { EpisodeStatus, prisma } from '@allvision/database';
import { app } from '../app';
import { _resetProvidersForTests } from '../providers';
import { signAccessToken } from '../utils/jwt';
import * as fileService from '../services/file-service';

const RUN_ID = Date.now();
const OWNER_EMAIL = `scenes-owner-${RUN_ID}@example.ru`;
const OTHER_EMAIL = `scenes-other-${RUN_ID}@example.ru`;

let tmpDir: string;
let originalUploads: string | undefined;
let originalApiUrl: string | undefined;
let ownerUserId: string;
let otherUserId: string;

function authCookie(userId: string) {
  return [`accessToken=${signAccessToken(userId, 'USER')}`];
}

async function imageBuffer(color = '#44aa88') {
  return sharp({
    create: { width: 32, height: 32, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length === 0) return;

  await prisma.episodeCharacter.deleteMany({ where: { episode: { userId: { in: userIds } } } });
  await prisma.abuseReport.deleteMany({ where: { episode: { userId: { in: userIds } } } });
  await prisma.episode.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.scene.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function createScene(userId = ownerUserId) {
  return prisma.scene.create({
    data: {
      userId,
      name: `Scene ${RUN_ID}`,
      description: 'A detailed scene description',
      category: 'home',
      referenceImages: [`http://test.local:4000/static/scene-references/${userId}/test.png`],
    },
  });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scenes-test-'));
  originalUploads = process.env.UPLOADS_DIR;
  originalApiUrl = process.env.PUBLIC_API_URL;
  process.env.UPLOADS_DIR = tmpDir;
  process.env.PUBLIC_API_URL = 'http://test.local:4000';
  _resetProvidersForTests();

  await cleanup();
  const owner = await prisma.user.create({
    data: { email: OWNER_EMAIL, passwordHash: 'test', tokenBalance: 1000 },
  });
  const other = await prisma.user.create({
    data: { email: OTHER_EMAIL, passwordHash: 'test', tokenBalance: 1000 },
  });
  ownerUserId = owner.id;
  otherUserId = other.id;
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

describe('/api/scenes', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/scenes');
    expect(res.status).toBe(401);
  });

  it('returns 400 without files', async () => {
    const res = await request(app)
      .post('/api/scenes')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `No Files Scene ${RUN_ID}`)
      .field('description', 'Scene description');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('returns 400 for more than three files', async () => {
    const req = request(app)
      .post('/api/scenes')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `Too Many Scene Files ${RUN_ID}`)
      .field('description', 'Scene description');

    for (let index = 0; index < 4; index += 1) {
      req.attach('images', await imageBuffer(), { filename: `scene-${index}.png`, contentType: 'image/png' });
    }

    const res = await req;
    expect(res.status).toBe(400);
  });

  it('creates an unpaid scene with reference images', async () => {
    const res = await request(app)
      .post('/api/scenes')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `Happy Scene ${RUN_ID}`)
      .field('description', 'A room with bright windows')
      .field('category', 'home')
      .attach('images', await imageBuffer(), { filename: 'scene.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.scene.isPaid).toBe(false);
    expect(res.body.scene.referenceImages).toHaveLength(1);
    expect(res.body.scene.referenceImages[0]).toContain('/static/scene-references/');
  });

  it('updates editable fields', async () => {
    const scene = await createScene();

    const res = await request(app)
      .patch(`/api/scenes/${scene.id}`)
      .set('Cookie', authCookie(ownerUserId))
      .send({ name: `Patched Scene ${RUN_ID}`, description: 'Updated scene', category: 'studio', isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.scene.name).toBe(`Patched Scene ${RUN_ID}`);
    expect(res.body.scene.isActive).toBe(false);
  });

  it('returns 404 for another user scene', async () => {
    const scene = await createScene(ownerUserId);

    const res = await request(app)
      .get(`/api/scenes/${scene.id}`)
      .set('Cookie', authCookie(otherUserId));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SCENE_NOT_FOUND');
  });

  it('returns 409 SCENE_IN_USE for active episodes', async () => {
    const scene = await createScene(ownerUserId);
    await prisma.episode.create({
      data: {
        userId: ownerUserId,
        sceneId: scene.id,
        title: `Scene Active Episode ${RUN_ID}`,
        status: EpisodeStatus.PROCESSING_VIDEO,
        tokensCost: 1,
      },
    });

    const res = await request(app)
      .delete(`/api/scenes/${scene.id}`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SCENE_IN_USE');
  });

  it('hard-deletes a scene and deletes reference files', async () => {
    const created = await request(app)
      .post('/api/scenes')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `Delete Scene ${RUN_ID}`)
      .field('description', 'Delete scene description')
      .attach('images', await imageBuffer(), { filename: 'scene.png', contentType: 'image/png' });
    expect(created.status).toBe(201);

    const deleteSpy = jest.spyOn(fileService, 'deleteFile').mockResolvedValue(undefined);
    const res = await request(app)
      .delete(`/api/scenes/${created.body.scene.id}`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith(expect.stringContaining('scene-references/'));
    await expect(prisma.scene.findUniqueOrThrow({ where: { id: created.body.scene.id } })).rejects.toThrow();
  });
});
