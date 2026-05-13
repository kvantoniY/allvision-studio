import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { prisma } from '@allvision/database';
import { getChatModel } from '@allvision/shared';
import { app } from '../app';
import { _resetProvidersForTests } from '../providers';
import { signAccessToken } from '../utils/jwt';
import * as queuesModule from '../queues';

const RUN_ID = Date.now();
const USER_EMAIL = `chat-user-${RUN_ID}@example.com`;
const OTHER_EMAIL = `chat-other-${RUN_ID}@example.com`;

let tmpDir: string;
let originalUploads: string | undefined;
let originalApiUrl: string | undefined;
let userId: string;
let otherUserId: string;

function authCookie(id: string) {
  return [`accessToken=${signAccessToken(id, 'USER')}`];
}

async function pngBuffer() {
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: '#44aa99' },
  }).png().toBuffer();
}

async function createAsset(ownerUserId: string | null, title: string) {
  return prisma.mediaAsset.create({
    data: {
      ownerUserId,
      kind: ownerUserId ? 'user-avatar' : 'preview-image',
      title,
      tags: [],
      storageKey: `media-assets/chat-test/${RUN_ID}-${title}.jpg`,
      publicUrl: `http://test.local:4000/static/media-assets/chat-test/${RUN_ID}-${title}.jpg`,
      fileSize: 10,
      mimeType: 'image/jpeg',
      isActive: true,
    },
  });
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [USER_EMAIL, OTHER_EMAIL] } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  if (ids.length > 0) {
    await prisma.tokenTransaction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.project.deleteMany({ where: { userId: { in: ids } } });
    await prisma.mediaAsset.deleteMany({ where: { ownerUserId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.mediaAsset.deleteMany({ where: { title: { contains: `Chat ${RUN_ID}` } } });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-chat-test-'));
  originalUploads = process.env.UPLOADS_DIR;
  originalApiUrl = process.env.PUBLIC_API_URL;
  process.env.UPLOADS_DIR = tmpDir;
  process.env.PUBLIC_API_URL = 'http://test.local:4000';
  _resetProvidersForTests();
  await cleanup();
  const [user, other] = await Promise.all([
    prisma.user.create({ data: { email: USER_EMAIL, passwordHash: 'hash', tokenBalance: 1000 } }),
    prisma.user.create({ data: { email: OTHER_EMAIL, passwordHash: 'hash', tokenBalance: 1000 } }),
  ]);
  userId = user.id;
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

describe('/api/user/chat', () => {
  it('uploads a temporary chat image and rejects unsupported files', async () => {
    const ok = await request(app)
      .post('/api/user/chat/upload')
      .set('Cookie', authCookie(userId))
      .attach('file', await pngBuffer(), { filename: 'input.png', contentType: 'image/png' });

    expect(ok.status).toBe(201);
    expect(ok.body.input.ref).toContain(`chat:user-uploads/chat/${userId}/`);
    expect(ok.body.input.mediaKind).toBe('image');

    const invalid = await request(app)
      .post('/api/user/chat/upload')
      .set('Cookie', authCookie(userId))
      .attach('file', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('UNSUPPORTED_FORMAT');
  });

  it('creates a free-chat text-to-image project and charges the user', async () => {
    const addJob = jest.spyOn(queuesModule, 'addServicePipelineJob').mockResolvedValue({} as never);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const cost = getChatModel('nano-banana')?.estimatedCostCoins ?? 10;

    const res = await request(app)
      .post('/api/user/chat/generate')
      .set('Cookie', authCookie(userId))
      .send({
        modelSlug: 'nano-banana',
        prompt: 'A bright cinematic portrait of a designer in a neon studio',
        aspectRatio: '1:1',
      });

    expect(res.status).toBe(202);
    expect(res.body.projectId).toBe(res.body.project.id);
    expect(addJob).toHaveBeenCalledWith({ projectId: res.body.project.id, userId, mode: 'production' });

    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.body.project.id } });
    expect(project.mode).toBe('free-chat');
    expect(project.pipelineSnapshot).toEqual(expect.arrayContaining([expect.objectContaining({ blockSlug: 'image-edit' })]));
    expect(project.userInputs).toEqual(expect.objectContaining({
      chatGeneration: expect.objectContaining({ modelSlug: 'nano-banana', category: 'image' }),
    }));

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.tokenBalance).toBe(before.tokenBalance - cost);
  });

  it('validates required image inputs and asset ownership', async () => {
    jest.spyOn(queuesModule, 'addServicePipelineJob').mockResolvedValue({} as never);
    const owned = await createAsset(userId, `Chat ${RUN_ID} owned`);
    const foreign = await createAsset(otherUserId, `Chat ${RUN_ID} foreign`);

    const missing = await request(app)
      .post('/api/user/chat/generate')
      .set('Cookie', authCookie(userId))
      .send({
        modelSlug: 'kling-std',
        prompt: 'Slow gentle camera movement',
        aspectRatio: '16:9',
      });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('IMAGE_INPUT_REQUIRED');

    const forbidden = await request(app)
      .post('/api/user/chat/generate')
      .set('Cookie', authCookie(userId))
      .send({
        modelSlug: 'kling-std',
        prompt: 'Slow gentle camera movement',
        aspectRatio: '16:9',
        imageInputRef: `asset:${foreign.id}`,
      });
    expect(forbidden.status).toBe(404);

    const ok = await request(app)
      .post('/api/user/chat/generate')
      .set('Cookie', authCookie(userId))
      .send({
        modelSlug: 'kling-std',
        prompt: 'Slow gentle camera movement',
        aspectRatio: '16:9',
        imageInputRef: `asset:${owned.id}`,
      });
    expect(ok.status).toBe(202);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: ok.body.projectId } });
    expect(project.pipelineSnapshot).toEqual(expect.arrayContaining([
      expect.objectContaining({ blockSlug: 'image-to-video', input: `asset:${owned.id}` }),
    ]));
  });

  it('refunds when free-chat cannot be queued', async () => {
    jest.spyOn(queuesModule, 'addServicePipelineJob').mockRejectedValue(new Error('queue down'));
    const before = await prisma.user.findUniqueOrThrow({ where: { id: otherUserId } });

    const res = await request(app)
      .post('/api/user/chat/generate')
      .set('Cookie', authCookie(otherUserId))
      .send({
        modelSlug: 'nano-banana',
        prompt: 'A clean minimal product photo on white background',
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

  it('returns only free-chat history for the current user', async () => {
    const project = await prisma.project.create({
      data: {
        userId,
        mode: 'free-chat',
        title: `Chat ${RUN_ID} history`,
        status: 'COMPLETED',
        progress: 100,
        inputImages: [],
        inputText: 'History prompt',
        tokensCost: 10,
        resultImage: 'http://test.local:4000/static/results/history.jpg',
        pipelineSnapshot: [],
        userInputs: { chatGeneration: { modelSlug: 'nano-banana', category: 'image', prompt: 'History prompt' } },
        stepProgress: [],
      },
    });
    await prisma.project.create({
      data: {
        userId,
        mode: 'service',
        title: `Chat ${RUN_ID} service`,
        status: 'COMPLETED',
        progress: 100,
        inputImages: [],
        tokensCost: 10,
      },
    });

    const res = await request(app)
      .get('/api/user/chat/history?limit=20')
      .set('Cookie', authCookie(userId));

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toContain(project.id);
    expect(res.body.items.every((item: { modelSlug: string | null }) => item.modelSlug !== null)).toBe(true);
    expect(res.body.items.map((item: { title: string }) => item.title)).not.toContain(`Chat ${RUN_ID} service`);
  });
});
