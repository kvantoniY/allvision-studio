import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { CharacterStatus, CharacterType, EpisodeStatus, prisma } from '@allvision/database';
import { app } from '../app';
import { _resetProvidersForTests } from '../providers';
import { signAccessToken } from '../utils/jwt';
import * as fileService from '../services/file-service';

const RUN_ID = Date.now();
const OWNER_EMAIL = `characters-owner-${RUN_ID}@example.com`;
const OTHER_EMAIL = `characters-other-${RUN_ID}@example.com`;

let tmpDir: string;
let originalUploads: string | undefined;
let originalApiUrl: string | undefined;
let ownerUserId: string;
let otherUserId: string;

function authCookie(userId: string) {
  return [`accessToken=${signAccessToken(userId, 'USER')}`];
}

async function imageBuffer(color = '#8855ff') {
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

  await prisma.episodeCharacter.deleteMany({
    where: { OR: [{ episode: { userId: { in: userIds } } }, { character: { userId: { in: userIds } } }] },
  });
  await prisma.abuseReport.deleteMany({
    where: { OR: [{ character: { userId: { in: userIds } } }, { episode: { userId: { in: userIds } } }] },
  });
  await prisma.episode.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.character.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function createCharacter(userId = ownerUserId) {
  return prisma.character.create({
    data: {
      userId,
      name: `Character ${RUN_ID}`,
      type: CharacterType.HUMAN,
      referenceImages: [`http://test.local:4000/static/character-references/${userId}/test.png`],
      consentGiven: true,
      consentAt: new Date(),
      status: CharacterStatus.READY,
    },
  });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'characters-test-'));
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

describe('/api/characters', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/characters');
    expect(res.status).toBe(401);
  });

  it('returns 400 CONSENT_REQUIRED without consent', async () => {
    const res = await request(app)
      .post('/api/characters')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `No Consent ${RUN_ID}`)
      .field('type', 'HUMAN')
      .attach('images', await imageBuffer(), { filename: 'face.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONSENT_REQUIRED');
  });

  it('returns 400 without files', async () => {
    const res = await request(app)
      .post('/api/characters')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `No Files ${RUN_ID}`)
      .field('type', 'HUMAN')
      .field('consentGiven', 'true');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('returns 400 for more than five files', async () => {
    const req = request(app)
      .post('/api/characters')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `Too Many Files ${RUN_ID}`)
      .field('type', 'HUMAN')
      .field('consentGiven', 'true');

    for (let index = 0; index < 6; index += 1) {
      req.attach('images', await imageBuffer(), { filename: `face-${index}.png`, contentType: 'image/png' });
    }

    const res = await req;
    expect(res.status).toBe(400);
  });

  it('creates a READY unpaid character with reference images', async () => {
    const res = await request(app)
      .post('/api/characters')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `Happy Character ${RUN_ID}`)
      .field('type', 'PET')
      .field('gender', 'OTHER')
      .field('ageGroup', 'adult')
      .field('description', 'A studio-ready test character')
      .field('consentGiven', 'true')
      .attach('images', await imageBuffer(), { filename: 'face.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.character.status).toBe(CharacterStatus.READY);
    expect(res.body.character.isPaid).toBe(false);
    expect(res.body.character.nsfwChecked).toBe(false);
    expect(res.body.character.referenceImages).toHaveLength(1);
    expect(res.body.character.referenceImages[0]).toContain('/static/character-references/');
  });

  it('updates editable fields', async () => {
    const character = await createCharacter();

    const res = await request(app)
      .patch(`/api/characters/${character.id}`)
      .set('Cookie', authCookie(ownerUserId))
      .send({ name: `Patched ${RUN_ID}`, description: 'patched', primaryImageId: 0, isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.character.name).toBe(`Patched ${RUN_ID}`);
    expect(res.body.character.isActive).toBe(false);
  });

  it('returns 404 for another user character', async () => {
    const character = await createCharacter(ownerUserId);

    const res = await request(app)
      .get(`/api/characters/${character.id}`)
      .set('Cookie', authCookie(otherUserId));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CHARACTER_NOT_FOUND');
  });

  it('returns 409 CHARACTER_IN_USE for active episodes', async () => {
    const character = await createCharacter(ownerUserId);
    const episode = await prisma.episode.create({
      data: {
        userId: ownerUserId,
        title: `Character Active Episode ${RUN_ID}`,
        status: EpisodeStatus.PROCESSING_IMAGE,
        tokensCost: 1,
      },
    });
    await prisma.episodeCharacter.create({
      data: { episodeId: episode.id, characterId: character.id, role: 'main' },
    });

    const res = await request(app)
      .delete(`/api/characters/${character.id}`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHARACTER_IN_USE');
  });

  it('hard-deletes a character and deletes reference files', async () => {
    const created = await request(app)
      .post('/api/characters')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `Delete Character ${RUN_ID}`)
      .field('type', 'HUMAN')
      .field('consentGiven', 'true')
      .attach('images', await imageBuffer(), { filename: 'face.png', contentType: 'image/png' });
    expect(created.status).toBe(201);

    const deleteSpy = jest.spyOn(fileService, 'deleteFile').mockResolvedValue(undefined);
    const res = await request(app)
      .delete(`/api/characters/${created.body.character.id}`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith(expect.stringContaining('character-references/'));
    await expect(prisma.character.findUniqueOrThrow({ where: { id: created.body.character.id } })).rejects.toThrow();
  });
});
