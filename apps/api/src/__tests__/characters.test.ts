import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { CharacterStatus, CharacterType, EpisodeStatus, prisma } from '@allvision/database';
import { CHARACTER_SLOT_PRICE_TOKENS } from '@allvision/shared';
import { app } from '../app';
import { _resetProvidersForTests } from '../providers';
import { signAccessToken } from '../utils/jwt';
import * as fileService from '../services/file-service';
import * as queuesModule from '../queues';
import { processCharacterNsfw } from '../../../worker/src/processors/character-nsfw';
import { _resetWorkerProvidersForTests } from '../../../worker/src/providers';

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

async function cleanupUsersByEmail() {
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

async function resetRecords() {
  const userIds = [ownerUserId, otherUserId];
  await prisma.episodeCharacter.deleteMany({
    where: { OR: [{ episode: { userId: { in: userIds } } }, { character: { userId: { in: userIds } } }] },
  });
  await prisma.abuseReport.deleteMany({
    where: { OR: [{ character: { userId: { in: userIds } } }, { episode: { userId: { in: userIds } } }] },
  });
  await prisma.episode.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.character.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { tokenBalance: 1000, freeCharacterUsed: false },
  });
}

async function createCharacter(
  options: {
    userId?: string;
    status?: CharacterStatus;
    isPaid?: boolean;
    referenceImages?: string[];
    name?: string;
    type?: CharacterType;
  } = {},
) {
  const userId = options.userId ?? ownerUserId;
  return prisma.character.create({
    data: {
      userId,
      name: options.name ?? `Character ${RUN_ID}`,
      type: options.type ?? CharacterType.HUMAN,
      referenceImages: options.referenceImages ?? [`http://test.local:4000/static/character-references/${userId}/test.png`],
      consentGiven: true,
      consentAt: new Date(),
      status: options.status ?? CharacterStatus.READY,
      isPaid: options.isPaid ?? false,
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
  _resetWorkerProvidersForTests();

  await cleanupUsersByEmail();
  const owner = await prisma.user.create({
    data: { email: OWNER_EMAIL, passwordHash: 'test', tokenBalance: 1000 },
  });
  const other = await prisma.user.create({
    data: { email: OTHER_EMAIL, passwordHash: 'test', tokenBalance: 1000 },
  });
  ownerUserId = owner.id;
  otherUserId = other.id;
});

beforeEach(async () => {
  await resetRecords();
  jest.spyOn(queuesModule, 'addCharacterJob').mockResolvedValue({ id: 'character-job' } as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await cleanupUsersByEmail();
  process.env.UPLOADS_DIR = originalUploads;
  process.env.PUBLIC_API_URL = originalApiUrl;
  _resetProvidersForTests();
  _resetWorkerProvidersForTests();
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

  it('creates the first character for free in PROCESSING status', async () => {
    const res = await request(app)
      .post('/api/characters')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `First Character ${RUN_ID}`)
      .field('type', 'PET')
      .field('gender', 'OTHER')
      .field('ageGroup', 'adult')
      .field('description', 'A studio-ready test character')
      .field('consentGiven', 'true')
      .attach('images', await imageBuffer(), { filename: 'face.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.character.status).toBe(CharacterStatus.PROCESSING);
    expect(res.body.character.isPaid).toBe(false);
    expect(res.body.character.nsfwChecked).toBe(false);
    expect(res.body.character.referenceImages).toHaveLength(1);
    expect(res.body.character.referenceImages[0]).toContain('/static/character-references/');
    expect(queuesModule.addCharacterJob).toHaveBeenCalledWith({
      characterId: res.body.character.id,
      userId: ownerUserId,
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerUserId } });
    expect(user.freeCharacterUsed).toBe(true);
    expect(user.tokenBalance).toBe(1000);
    await expect(
      prisma.tokenTransaction.findFirst({
        where: { userId: ownerUserId, refId: res.body.character.id, reason: 'character_slot' },
      }),
    ).resolves.toBeNull();
  });

  it('charges 200 tokens for the second character', async () => {
    await prisma.user.update({
      where: { id: ownerUserId },
      data: { freeCharacterUsed: true, tokenBalance: 500 },
    });

    const res = await request(app)
      .post('/api/characters')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `Paid Character ${RUN_ID}`)
      .field('type', 'HUMAN')
      .field('gender', 'FEMALE')
      .field('ageGroup', 'adult')
      .field('consentGiven', 'true')
      .attach('images', await imageBuffer('#4488ff'), { filename: 'face.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.character.status).toBe(CharacterStatus.PROCESSING);
    expect(res.body.character.isPaid).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerUserId } });
    expect(user.freeCharacterUsed).toBe(true);
    expect(user.tokenBalance).toBe(300);

    const tx = await prisma.tokenTransaction.findFirstOrThrow({
      where: { userId: ownerUserId, refId: res.body.character.id, reason: 'character_slot' },
    });
    expect(tx.amount).toBe(-CHARACTER_SLOT_PRICE_TOKENS);
    expect(tx.balanceAfter).toBe(300);
  });

  it('returns 402 INSUFFICIENT_TOKENS for a paid character with balance 199', async () => {
    await prisma.user.update({
      where: { id: ownerUserId },
      data: { freeCharacterUsed: true, tokenBalance: 199 },
    });

    const res = await request(app)
      .post('/api/characters')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `Poor Character ${RUN_ID}`)
      .field('type', 'HUMAN')
      .field('gender', 'MALE')
      .field('ageGroup', 'adult')
      .field('consentGiven', 'true')
      .attach('images', await imageBuffer('#44ff88'), { filename: 'face.png', contentType: 'image/png' });

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_TOKENS');
    await expect(prisma.character.count({ where: { userId: ownerUserId } })).resolves.toBe(0);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerUserId } });
    expect(user.tokenBalance).toBe(199);
  });

  it('returns 503 and resets the free slot when NSFW queue is unavailable for a free character', async () => {
    (queuesModule.addCharacterJob as jest.Mock).mockRejectedValueOnce(new Error('redis down'));

    const res = await request(app)
      .post('/api/characters')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `Queue Free ${RUN_ID}`)
      .field('type', 'HUMAN')
      .field('gender', 'MALE')
      .field('ageGroup', 'adult')
      .field('consentGiven', 'true')
      .attach('images', await imageBuffer('#aabbcc'), { filename: 'face.png', contentType: 'image/png' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('QUEUE_UNAVAILABLE');

    const character = await prisma.character.findFirstOrThrow({
      where: { userId: ownerUserId, name: `Queue Free ${RUN_ID}` },
    });
    expect(character.status).toBe(CharacterStatus.REJECTED);
    expect(character.isPaid).toBe(false);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerUserId } });
    expect(user.freeCharacterUsed).toBe(false);
    expect(user.tokenBalance).toBe(1000);
  });

  it('returns 503 and refunds tokens when NSFW queue is unavailable for a paid character', async () => {
    await prisma.user.update({
      where: { id: ownerUserId },
      data: { freeCharacterUsed: true, tokenBalance: 500 },
    });
    (queuesModule.addCharacterJob as jest.Mock).mockRejectedValueOnce(new Error('redis down'));

    const res = await request(app)
      .post('/api/characters')
      .set('Cookie', authCookie(ownerUserId))
      .field('name', `Queue Paid ${RUN_ID}`)
      .field('type', 'HUMAN')
      .field('gender', 'MALE')
      .field('ageGroup', 'adult')
      .field('consentGiven', 'true')
      .attach('images', await imageBuffer('#ccbbaa'), { filename: 'face.png', contentType: 'image/png' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('QUEUE_UNAVAILABLE');

    const character = await prisma.character.findFirstOrThrow({
      where: { userId: ownerUserId, name: `Queue Paid ${RUN_ID}` },
    });
    expect(character.status).toBe(CharacterStatus.REJECTED);
    expect(character.isPaid).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerUserId } });
    expect(user.tokenBalance).toBe(500);
    const refund = await prisma.tokenTransaction.findFirstOrThrow({
      where: { userId: ownerUserId, refId: character.id, reason: 'refund' },
    });
    expect(refund.amount).toBe(CHARACTER_SLOT_PRICE_TOKENS);
    expect(refund.balanceAfter).toBe(500);
  });

  it('marks a safe character READY via NSFW worker', async () => {
    const character = await createCharacter({ status: CharacterStatus.PROCESSING });

    await processCharacterNsfw({ data: { characterId: character.id, userId: ownerUserId } } as any);

    const updated = await prisma.character.findUniqueOrThrow({ where: { id: character.id } });
    expect(updated.status).toBe(CharacterStatus.READY);
    expect(updated.nsfwChecked).toBe(true);
  });

  it('skips NSFW worker work when character is not PROCESSING', async () => {
    const character = await createCharacter({ status: CharacterStatus.READY });

    await processCharacterNsfw({ data: { characterId: character.id, userId: ownerUserId } } as any);

    const updated = await prisma.character.findUniqueOrThrow({ where: { id: character.id } });
    expect(updated.status).toBe(CharacterStatus.READY);
    expect(updated.nsfwChecked).toBe(false);
  });

  it('rejects an unsafe paid character and refunds tokens', async () => {
    await prisma.user.update({
      where: { id: ownerUserId },
      data: { tokenBalance: 300, freeCharacterUsed: true },
    });
    const character = await createCharacter({
      status: CharacterStatus.PROCESSING,
      isPaid: true,
      referenceImages: ['http://test.local:4000/static/character-references/nsfw-face.png'],
    });

    await processCharacterNsfw({ data: { characterId: character.id, userId: ownerUserId } } as any);

    const updated = await prisma.character.findUniqueOrThrow({ where: { id: character.id } });
    expect(updated.status).toBe(CharacterStatus.REJECTED);
    expect(updated.nsfwChecked).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerUserId } });
    expect(user.tokenBalance).toBe(500);
    const refund = await prisma.tokenTransaction.findFirstOrThrow({
      where: { userId: ownerUserId, refId: character.id, reason: 'refund' },
    });
    expect(refund.amount).toBe(CHARACTER_SLOT_PRICE_TOKENS);
  });

  it('rejects an unsafe free character and resets freeCharacterUsed', async () => {
    await prisma.user.update({
      where: { id: ownerUserId },
      data: { freeCharacterUsed: true },
    });
    const character = await createCharacter({
      status: CharacterStatus.PROCESSING,
      isPaid: false,
      referenceImages: ['http://test.local:4000/static/character-references/nsfw-free.png'],
    });

    await processCharacterNsfw({ data: { characterId: character.id, userId: ownerUserId } } as any);

    const updated = await prisma.character.findUniqueOrThrow({ where: { id: character.id } });
    expect(updated.status).toBe(CharacterStatus.REJECTED);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerUserId } });
    expect(user.freeCharacterUsed).toBe(false);
  });

  it('lists characters filtered by READY status', async () => {
    await createCharacter({ status: CharacterStatus.READY, name: `Ready ${RUN_ID}` });
    await createCharacter({ status: CharacterStatus.PROCESSING, name: `Processing ${RUN_ID}` });

    const res = await request(app)
      .get('/api/characters?status=READY')
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe(`Ready ${RUN_ID}`);
  });

  it('lists characters filtered by type', async () => {
    await createCharacter({ type: CharacterType.HUMAN, name: `Human ${RUN_ID}` });
    await createCharacter({ type: CharacterType.PET, name: `Pet ${RUN_ID}` });

    const res = await request(app)
      .get('/api/characters?type=PET')
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe(`Pet ${RUN_ID}`);
  });

  it('replaces reference images and returns character to PROCESSING', async () => {
    const character = await createCharacter({
      referenceImages: [
        'http://test.local:4000/static/character-references/old-1.png',
        'http://test.local:4000/static/character-references/old-2.png',
      ],
    });
    const deleteSpy = jest.spyOn(fileService, 'deleteFile').mockResolvedValue(undefined);

    const req = request(app)
      .patch(`/api/characters/${character.id}/reference-images`)
      .set('Cookie', authCookie(ownerUserId))
      .field('primaryImageId', '1');

    req.attach('images', await imageBuffer('#111111'), { filename: 'face-1.png', contentType: 'image/png' });
    req.attach('images', await imageBuffer('#222222'), { filename: 'face-2.png', contentType: 'image/png' });
    req.attach('images', await imageBuffer('#333333'), { filename: 'face-3.png', contentType: 'image/png' });

    const res = await req;
    expect(res.status).toBe(200);
    expect(res.body.character.status).toBe(CharacterStatus.PROCESSING);
    expect(res.body.character.nsfwChecked).toBe(false);
    expect(res.body.character.primaryImageId).toBe(1);
    expect(res.body.character.referenceImages).toHaveLength(3);
    expect(queuesModule.addCharacterJob).toHaveBeenCalledWith({
      characterId: character.id,
      userId: ownerUserId,
    });
    expect(deleteSpy).toHaveBeenCalledTimes(2);
  });

  it('returns 400 INVALID_PRIMARY_IMAGE_ID when replacing with out-of-range primary image', async () => {
    const character = await createCharacter();

    const res = await request(app)
      .patch(`/api/characters/${character.id}/reference-images`)
      .set('Cookie', authCookie(ownerUserId))
      .field('primaryImageId', '1')
      .attach('images', await imageBuffer('#123456'), { filename: 'face.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PRIMARY_IMAGE_ID');
  });

  it('returns 404 when another user replaces reference images', async () => {
    const character = await createCharacter({ userId: ownerUserId });

    const res = await request(app)
      .patch(`/api/characters/${character.id}/reference-images`)
      .set('Cookie', authCookie(otherUserId))
      .attach('images', await imageBuffer('#654321'), { filename: 'face.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CHARACTER_NOT_FOUND');
  });

  it('returns 409 CHARACTER_BUSY when replacing images during PROCESSING', async () => {
    const character = await createCharacter({ status: CharacterStatus.PROCESSING });

    const res = await request(app)
      .patch(`/api/characters/${character.id}/reference-images`)
      .set('Cookie', authCookie(ownerUserId))
      .attach('images', await imageBuffer('#999999'), { filename: 'face.png', contentType: 'image/png' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHARACTER_BUSY');
  });

  it('starts NSFW check for a DRAFT character', async () => {
    const character = await createCharacter({ status: CharacterStatus.DRAFT });

    const res = await request(app)
      .post(`/api/characters/${character.id}/nsfw-check`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(200);
    expect(res.body.character.status).toBe(CharacterStatus.PROCESSING);
    expect(res.body.character.nsfwChecked).toBe(false);
    expect(queuesModule.addCharacterJob).toHaveBeenCalledWith({
      characterId: character.id,
      userId: ownerUserId,
    });
  });

  it('returns 409 CHARACTER_BUSY when starting check for PROCESSING character', async () => {
    const character = await createCharacter({ status: CharacterStatus.PROCESSING });

    const res = await request(app)
      .post(`/api/characters/${character.id}/nsfw-check`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHARACTER_BUSY');
  });

  it('returns 404 when another user starts NSFW check', async () => {
    const character = await createCharacter({ userId: ownerUserId, status: CharacterStatus.DRAFT });

    const res = await request(app)
      .post(`/api/characters/${character.id}/nsfw-check`)
      .set('Cookie', authCookie(otherUserId));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CHARACTER_NOT_FOUND');
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

  it('returns 400 INVALID_PRIMARY_IMAGE_ID for editable field update', async () => {
    const character = await createCharacter();

    const res = await request(app)
      .patch(`/api/characters/${character.id}`)
      .set('Cookie', authCookie(ownerUserId))
      .send({ primaryImageId: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PRIMARY_IMAGE_ID');
  });

  it('returns 404 for another user character', async () => {
    const character = await createCharacter({ userId: ownerUserId });

    const res = await request(app)
      .get(`/api/characters/${character.id}`)
      .set('Cookie', authCookie(otherUserId));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CHARACTER_NOT_FOUND');
  });

  it('returns 404 when deleting another user character', async () => {
    const character = await createCharacter({ userId: ownerUserId });

    const res = await request(app)
      .delete(`/api/characters/${character.id}`)
      .set('Cookie', authCookie(otherUserId));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CHARACTER_NOT_FOUND');
  });

  it('returns 409 CHARACTER_IN_USE for active episodes', async () => {
    const character = await createCharacter({ userId: ownerUserId });
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
