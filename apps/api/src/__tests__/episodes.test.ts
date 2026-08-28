import request from 'supertest';
import { CharacterStatus, CharacterType, EpisodeStatus, prisma } from '@allvision/database';
import {
  EPISODE_REGENERATION_PRICE_TOKENS,
  EPISODE_WATERMARK_REMOVAL_PRICE_TOKENS,
} from '@allvision/shared';
import { app } from '../app';
import { signAccessToken } from '../utils/jwt';
import * as queuesModule from '../queues';
import { processEpisode } from '../../../worker/src/processors/episode';
import * as workerProviders from '../../../worker/src/providers';

const RUN_ID = Date.now();
const OWNER_EMAIL = `episodes-owner-${RUN_ID}@example.ru`;
const OTHER_EMAIL = `episodes-other-${RUN_ID}@example.ru`;
const TEMPLATE_PREFIX = `episode-test-${RUN_ID}`;

let ownerUserId: string;
let otherUserId: string;

function authCookie(userId: string) {
  return [`accessToken=${signAccessToken(userId, 'USER')}`];
}

const oneRole = [{ role: 'main', required: true, label: 'Главный герой' }];
const twoRequiredRoles = [
  { role: 'main', required: true, label: 'Первый герой' },
  { role: 'secondary', required: true, label: 'Второй герой' },
];

async function cleanupUsersByEmail() {
  const users = await prisma.user.findMany({
    where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  await prisma.episodeCharacter.deleteMany({
    where: { OR: [{ episode: { userId: { in: userIds } } }, { character: { userId: { in: userIds } } }] },
  });
  await prisma.abuseReport.deleteMany({
    where: { OR: [{ episode: { userId: { in: userIds } } }, { character: { userId: { in: userIds } } }] },
  });
  await prisma.episode.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.scene.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.character.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.scenarioTemplate.deleteMany({ where: { slug: { startsWith: TEMPLATE_PREFIX } } });
}

async function resetRecords() {
  const userIds = [ownerUserId, otherUserId];
  await prisma.episodeCharacter.deleteMany({
    where: { OR: [{ episode: { userId: { in: userIds } } }, { character: { userId: { in: userIds } } }] },
  });
  await prisma.abuseReport.deleteMany({
    where: { OR: [{ episode: { userId: { in: userIds } } }, { character: { userId: { in: userIds } } }] },
  });
  await prisma.episode.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.scene.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.character.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.tokenTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.scenarioTemplate.deleteMany({ where: { slug: { startsWith: TEMPLATE_PREFIX } } });
  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: { tokenBalance: 1000 },
  });
}

async function createTemplate(
  options: {
    slug?: string;
    priceTokens?: number;
    needsScene?: boolean;
    roles?: typeof oneRole;
    isActive?: boolean;
  } = {},
) {
  const slug = options.slug ?? `${TEMPLATE_PREFIX}-${Math.random().toString(36).slice(2)}`;
  return prisma.scenarioTemplate.create({
    data: {
      slug,
      title: `Template ${slug}`,
      shortDesc: 'Short template description',
      description: 'Long template description',
      category: 'family',
      previewVideo: 'https://example.com/template.mp4',
      previewImage: 'https://example.com/template.jpg',
      promptTemplate: '{{character_main}} in {{scene}} with {{character_secondary}}',
      characterRoles: options.roles ?? oneRole,
      needsScene: options.needsScene ?? false,
      recommendedDuration: 10,
      defaultStyle: 'cinematic',
      aiProvider: 'mock',
      aiModel: 'mock-episode-v1',
      aiConfig: {},
      priceTokens: options.priceTokens ?? 150,
      tags: ['test'],
      isActive: options.isActive ?? true,
      sortOrder: 1,
    },
  });
}

async function createCharacter(
  options: {
    userId?: string;
    status?: CharacterStatus;
    name?: string;
  } = {},
) {
  const userId = options.userId ?? ownerUserId;
  return prisma.character.create({
    data: {
      userId,
      name: options.name ?? `Episode Character ${RUN_ID}`,
      type: CharacterType.HUMAN,
      referenceImages: [`http://test.local/static/character-${Math.random()}.jpg`],
      primaryImageId: 0,
      consentGiven: true,
      consentAt: new Date(),
      nsfwChecked: true,
      status: options.status ?? CharacterStatus.READY,
    },
  });
}

async function createScene(userId = ownerUserId) {
  return prisma.scene.create({
    data: {
      userId,
      name: `Scene ${RUN_ID}`,
      description: 'A warm family kitchen',
      referenceImages: ['http://test.local/static/scene.jpg'],
    },
  });
}

async function createEpisode(
  options: {
    status?: EpisodeStatus;
    templateId?: string;
    characterId?: string;
    sceneId?: string | null;
    watermarkRemoved?: boolean;
  } = {},
) {
  const template = options.templateId ? null : await createTemplate();
  const character = options.characterId ? null : await createCharacter();
  const episode = await prisma.episode.create({
    data: {
      userId: ownerUserId,
      title: `Episode ${RUN_ID}`,
      status: options.status ?? EpisodeStatus.COMPLETED,
      progress: options.status === EpisodeStatus.COMPLETED ? 100 : 0,
      templateId: options.templateId ?? template!.id,
      sceneId: options.sceneId === undefined ? null : options.sceneId,
      durationSeconds: 10,
      style: 'cinematic',
      aspectRatio: '9:16',
      tokensCost: 150,
      resultImage: 'http://test.local/static/results/image.jpg',
      resultVideo: 'http://test.local/static/results/video.mp4',
      resultThumbnail: 'http://test.local/static/results/thumb.jpg',
      completedAt: options.status === EpisodeStatus.COMPLETED ? new Date() : null,
      watermarkRemoved: options.watermarkRemoved ?? false,
    },
  });
  await prisma.episodeCharacter.create({
    data: { episodeId: episode.id, characterId: options.characterId ?? character!.id, role: 'main' },
  });
  return episode;
}

beforeAll(async () => {
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
  jest.spyOn(queuesModule, 'addEpisodeJob').mockResolvedValue({ id: 'episode-job' } as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await cleanupUsersByEmail();
  await prisma.$disconnect();
});

describe('/api/episodes', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/episodes').send({});
    expect(res.status).toBe(401);
  });

  it('returns 404 TEMPLATE_NOT_FOUND for an unknown template', async () => {
    const character = await createCharacter();

    const res = await request(app)
      .post('/api/episodes')
      .set('Cookie', authCookie(ownerUserId))
      .send({ templateId: 'missing-template', characterIds: [character.id] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TEMPLATE_NOT_FOUND');
  });

  it('returns 400 INVALID_CHARACTERS for another user character', async () => {
    const template = await createTemplate();
    const character = await createCharacter({ userId: otherUserId });

    const res = await request(app)
      .post('/api/episodes')
      .set('Cookie', authCookie(ownerUserId))
      .send({ templateId: template.id, characterIds: [character.id] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CHARACTERS');
  });

  it('returns 400 INVALID_CHARACTERS for a non-ready character', async () => {
    const template = await createTemplate();
    const character = await createCharacter({ status: CharacterStatus.REJECTED });

    const res = await request(app)
      .post('/api/episodes')
      .set('Cookie', authCookie(ownerUserId))
      .send({ templateId: template.id, characterIds: [character.id] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CHARACTERS');
  });

  it('returns 400 SCENE_REQUIRED when a template needs a scene', async () => {
    const template = await createTemplate({ needsScene: true });
    const character = await createCharacter();

    const res = await request(app)
      .post('/api/episodes')
      .set('Cookie', authCookie(ownerUserId))
      .send({ templateId: template.id, characterIds: [character.id] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SCENE_REQUIRED');
  });

  it('returns 400 CHARACTER_ROLES_MISMATCH when required roles are missing', async () => {
    const template = await createTemplate({ roles: twoRequiredRoles });
    const character = await createCharacter();

    const res = await request(app)
      .post('/api/episodes')
      .set('Cookie', authCookie(ownerUserId))
      .send({ templateId: template.id, characterIds: [character.id] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CHARACTER_ROLES_MISMATCH');
  });

  it('returns 402 INSUFFICIENT_TOKENS', async () => {
    const template = await createTemplate({ priceTokens: 150 });
    const character = await createCharacter();
    await prisma.user.update({ where: { id: ownerUserId }, data: { tokenBalance: 149 } });

    const res = await request(app)
      .post('/api/episodes')
      .set('Cookie', authCookie(ownerUserId))
      .send({ templateId: template.id, characterIds: [character.id] });

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('INSUFFICIENT_TOKENS');
  });

  it('creates an episode, charges tokens, stores roles, and queues worker job', async () => {
    const template = await createTemplate({ needsScene: true, priceTokens: 150 });
    const character = await createCharacter();
    const scene = await createScene();

    const res = await request(app)
      .post('/api/episodes')
      .set('Cookie', authCookie(ownerUserId))
      .send({ templateId: template.id, characterIds: [character.id], sceneId: scene.id });

    expect(res.status).toBe(201);
    expect(res.body.episode.status).toBe(EpisodeStatus.PENDING);
    expect(res.body.episode.tokensCost).toBe(150);
    expect(queuesModule.addEpisodeJob).toHaveBeenCalledWith({
      episodeId: res.body.episode.id,
      userId: ownerUserId,
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerUserId } });
    expect(user.tokenBalance).toBe(850);

    const tx = await prisma.tokenTransaction.findFirstOrThrow({
      where: { userId: ownerUserId, refId: res.body.episode.id, reason: 'spending' },
    });
    expect(tx.amount).toBe(-150);

    const link = await prisma.episodeCharacter.findFirstOrThrow({ where: { episodeId: res.body.episode.id } });
    expect(link.role).toBe('main');
  });

  it('returns 503 and refunds tokens when the episode queue is unavailable', async () => {
    const template = await createTemplate({ priceTokens: 150 });
    const character = await createCharacter();
    (queuesModule.addEpisodeJob as jest.Mock).mockRejectedValueOnce(new Error('redis down'));

    const res = await request(app)
      .post('/api/episodes')
      .set('Cookie', authCookie(ownerUserId))
      .send({ templateId: template.id, characterIds: [character.id] });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('QUEUE_UNAVAILABLE');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerUserId } });
    expect(user.tokenBalance).toBe(1000);
    const episode = await prisma.episode.findFirstOrThrow({ where: { userId: ownerUserId } });
    expect(episode.status).toBe(EpisodeStatus.FAILED);
    const refund = await prisma.tokenTransaction.findFirstOrThrow({
      where: { userId: ownerUserId, refId: episode.id, reason: 'refund' },
    });
    expect(refund.amount).toBe(150);
  });

  it('lists episodes with template and characters', async () => {
    const template = await createTemplate();
    const character = await createCharacter();
    await createEpisode({ templateId: template.id, characterId: character.id });

    const res = await request(app)
      .get(`/api/episodes?status=${EpisodeStatus.COMPLETED}`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].template.slug).toBe(template.slug);
    expect(res.body.items[0].characters[0].character.name).toBe(character.name);
  });

  it('returns episode detail', async () => {
    const template = await createTemplate();
    const character = await createCharacter();
    const scene = await createScene();
    const episode = await createEpisode({ templateId: template.id, characterId: character.id, sceneId: scene.id });

    const res = await request(app)
      .get(`/api/episodes/${episode.id}`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(200);
    expect(res.body.episode.template.id).toBe(template.id);
    expect(res.body.episode.scene.id).toBe(scene.id);
    expect(res.body.episode.characters[0].character.id).toBe(character.id);
  });

  it('returns lightweight episode status', async () => {
    const episode = await createEpisode({ status: EpisodeStatus.PROCESSING_VIDEO });

    const res = await request(app)
      .get(`/api/episodes/${episode.id}/status`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(episode.id);
    expect(res.body.status).toBe(EpisodeStatus.PROCESSING_VIDEO);
    expect(res.body.watermarkRemoved).toBe(false);
    expect(res.body.template).toBeUndefined();
  });

  it('regenerates a completed episode for 30 tokens', async () => {
    const episode = await createEpisode({ status: EpisodeStatus.COMPLETED, watermarkRemoved: true });

    const res = await request(app)
      .post(`/api/episodes/${episode.id}/regenerate`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(200);
    expect(res.body.episode.status).toBe(EpisodeStatus.PENDING);
    expect(res.body.episode.resultVideo).toBeNull();
    expect(res.body.episode.watermarkRemoved).toBe(false);
    expect(queuesModule.addEpisodeJob).toHaveBeenCalledWith({ episodeId: episode.id, userId: ownerUserId });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerUserId } });
    expect(user.tokenBalance).toBe(1000 - EPISODE_REGENERATION_PRICE_TOKENS);
    const tx = await prisma.tokenTransaction.findFirstOrThrow({
      where: { refId: episode.id, reason: 'spending', amount: -EPISODE_REGENERATION_PRICE_TOKENS },
    });
    expect(tx.balanceAfter).toBe(user.tokenBalance);
  });

  it('returns 409 when regenerating a processing episode', async () => {
    const episode = await createEpisode({ status: EpisodeStatus.PROCESSING_IMAGE });

    const res = await request(app)
      .post(`/api/episodes/${episode.id}/regenerate`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EPISODE_NOT_REGENERATABLE');
  });

  it('removes watermark for 60 tokens', async () => {
    const episode = await createEpisode({ status: EpisodeStatus.COMPLETED, watermarkRemoved: false });

    const res = await request(app)
      .post(`/api/episodes/${episode.id}/remove-watermark`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(200);
    expect(res.body.episode.watermarkRemoved).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerUserId } });
    expect(user.tokenBalance).toBe(1000 - EPISODE_WATERMARK_REMOVAL_PRICE_TOKENS);
    const tx = await prisma.tokenTransaction.findFirstOrThrow({
      where: { refId: episode.id, reason: 'watermark_removal' },
    });
    expect(tx.amount).toBe(-EPISODE_WATERMARK_REMOVAL_PRICE_TOKENS);
  });

  it('returns 409 when removing watermark from a non-completed episode', async () => {
    const episode = await createEpisode({ status: EpisodeStatus.PENDING });

    const res = await request(app)
      .post(`/api/episodes/${episode.id}/remove-watermark`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EPISODE_NOT_COMPLETED');
  });

  it('returns 409 when removing watermark twice', async () => {
    const episode = await createEpisode({ status: EpisodeStatus.COMPLETED, watermarkRemoved: true });

    const res = await request(app)
      .post(`/api/episodes/${episode.id}/remove-watermark`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WATERMARK_ALREADY_REMOVED');
  });

  it('returns 409 when deleting a processing episode', async () => {
    const episode = await createEpisode({ status: EpisodeStatus.PROCESSING_VIDEO });

    const res = await request(app)
      .delete(`/api/episodes/${episode.id}`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EPISODE_BUSY');
  });

  it('hard-deletes a completed episode', async () => {
    const episode = await createEpisode({ status: EpisodeStatus.COMPLETED });

    const res = await request(app)
      .delete(`/api/episodes/${episode.id}`)
      .set('Cookie', authCookie(ownerUserId));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    await expect(prisma.episode.findUniqueOrThrow({ where: { id: episode.id } })).rejects.toThrow();
  });

  it('processes an episode through image and video stages', async () => {
    const template = await createTemplate({ needsScene: true });
    const character = await createCharacter({ name: 'Worker Hero' });
    const scene = await createScene();
    const episode = await prisma.episode.create({
      data: {
        userId: ownerUserId,
        title: 'Worker Episode',
        status: EpisodeStatus.PENDING,
        templateId: template.id,
        sceneId: scene.id,
        durationSeconds: 10,
        style: 'cinematic',
        aspectRatio: '9:16',
        tokensCost: 150,
      },
    });
    await prisma.episodeCharacter.create({
      data: { episodeId: episode.id, characterId: character.id, role: 'main' },
    });

    const fakeProvider = {
      name: 'mock',
      generateEpisodeImage: jest.fn().mockResolvedValue({ providerJobId: 'image-job' }),
      animateEpisodeVideo: jest.fn().mockResolvedValue({ providerJobId: 'video-job' }),
      getJobStatus: jest.fn(async (handle: { providerJobId: string }) => ({
        status: 'completed',
        progress: 100,
        resultUrl: handle.providerJobId === 'image-job' ? 'http://test.local/static/results/image.jpg' : 'http://test.local/static/results/video.mp4',
        resultType: handle.providerJobId === 'image-job' ? 'image' : 'video',
      })),
    };
    jest.spyOn(workerProviders, 'getLegacyAIProvider').mockReturnValue(fakeProvider as any);

    await processEpisode({ data: { episodeId: episode.id, userId: ownerUserId } } as any);

    const updated = await prisma.episode.findUniqueOrThrow({ where: { id: episode.id } });
    expect(updated.status).toBe(EpisodeStatus.COMPLETED);
    expect(updated.progress).toBe(100);
    expect(updated.resultImage).toContain('/results/image.jpg');
    expect(updated.resultVideo).toContain('/results/video.mp4');
    expect(fakeProvider.generateEpisodeImage).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('Worker Hero'),
      aspectRatio: '9:16',
    }));
    expect(fakeProvider.animateEpisodeVideo).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'http://test.local/static/results/image.jpg',
      durationSeconds: 10,
    }));
  });
});
