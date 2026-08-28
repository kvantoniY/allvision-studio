import request from 'supertest';
import { prisma } from '@allvision/database';
import { voiceoverPriceCoins } from '@allvision/shared';
import { app } from '../app';
import { signAccessToken } from '../utils/jwt';
import * as queuesModule from '../queues';

const RUN_ID = Date.now();
const USER_EMAIL = `video-projects-${RUN_ID}@example.ru`;
const OTHER_EMAIL = `video-projects-other-${RUN_ID}@example.ru`;

let userId: string;
let otherUserId: string;

function authCookie(id: string) {
  return [`accessToken=${signAccessToken(id, 'USER')}`];
}

/** Сцена из двух слоёв: на ней проверяется, что метка встаёт именно в названный. */
function collageTimeline() {
  return {
    version: 1,
    aspect: '9:16',
    scenes: [
      {
        id: 'scene_1',
        layers: [
          { id: 'layer_a', kind: 'media', source: { kind: 'image', url: '/static/a.jpg' } },
          { id: 'layer_b', kind: 'media', source: { kind: 'color', color: '#0b1020' } },
        ],
        durationSec: 4,
        transition: 'cut',
        muted: false,
        volume: 1,
        overlays: [],
      },
    ],
  };
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [USER_EMAIL, OTHER_EMAIL] } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  if (ids.length === 0) return;
  await prisma.tokenTransaction.deleteMany({ where: { userId: { in: ids } } });
  await prisma.videoProject.deleteMany({ where: { userId: { in: ids } } });
  await prisma.project.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
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
  await prisma.$disconnect();
});

describe('/api/user/video-projects', () => {
  it('creates a project and hides other people rolls behind 404', async () => {
    const created = await request(app).post('/api/user/video-projects').set('Cookie', authCookie(userId)).send({});
    expect(created.status).toBe(201);
    expect(created.body.project.timeline.scenes).toHaveLength(1);

    const mine = await request(app)
      .get(`/api/user/video-projects/${created.body.project.id}`)
      .set('Cookie', authCookie(userId));
    expect(mine.status).toBe(200);

    // Чужой ролик не отличается от несуществующего: сам факт наличия — тоже информация.
    const foreign = await request(app)
      .get(`/api/user/video-projects/${created.body.project.id}`)
      .set('Cookie', authCookie(otherUserId));
    expect(foreign.status).toBe(404);
  });

  it('marks the named layer, not the whole scene, when a generation starts', async () => {
    jest.spyOn(queuesModule, 'addServicePipelineJob').mockResolvedValue({} as never);
    const project = await prisma.videoProject.create({
      data: { userId, title: 'Коллаж', timeline: collageTimeline() as never },
    });

    const res = await request(app)
      .post(`/api/user/video-projects/${project.id}/scenes/scene_1/generate`)
      .set('Cookie', authCookie(userId))
      .send({
        modelSlug: 'nano-banana',
        prompt: 'Тёплый портрет в вечернем свете, мягкие тени,высокая детализация',
        layerId: 'layer_b',
      });

    expect(res.status).toBe(202);

    // Метка обязана лежать в слое: она нужна воркеру, чтобы результат встал именно туда,
    // даже если вкладку закроют до автосохранения редактора.
    const saved = await prisma.videoProject.findUniqueOrThrow({ where: { id: project.id } });
    const scene = (saved.timeline as never as { scenes: Array<Record<string, unknown>> }).scenes[0];
    const layers = scene.layers as Array<Record<string, unknown>>;
    expect(layers.find((layer) => layer.id === 'layer_b')?.generationProjectId).toBe(res.body.projectId);
    expect(layers.find((layer) => layer.id === 'layer_a')?.generationProjectId).toBeUndefined();
  });
});

describe('POST /api/user/video-projects/from-project', () => {
  it('opens a finished template with its scenes, titles and music', async () => {
    const source = await prisma.project.create({
      data: {
        userId,
        title: 'Ожившие фотографии',
        status: 'COMPLETED',
        progress: 100,
        mode: 'service',
        inputImages: [],
        tokensCost: 0,
        resultVideo: '/static/outputs/result.mp4',
        stepProgress: [
          {
            stepId: 'step_2',
            blockSlug: 'timeline-render',
            status: 'completed',
            progress: 100,
            output: {
              type: 'video',
              url: '/static/outputs/result.mp4',
              metadata: { resolvedTimeline: collageTimeline() },
            },
          },
        ] as never,
      },
    });

    const res = await request(app)
      .post('/api/user/video-projects/from-project')
      .set('Cookie', authCookie(userId))
      .send({ projectId: source.id });

    expect(res.status).toBe(201);
    // Раскладка переносится целиком, а не сводится к одному кадру.
    expect(res.body.project.timeline.scenes[0].layers).toHaveLength(2);
  });

  it('opens any other finished result as a single scene', async () => {
    const source = await prisma.project.create({
      data: {
        userId,
        title: 'Кадр из чата',
        status: 'COMPLETED',
        progress: 100,
        mode: 'free-chat',
        inputImages: [],
        tokensCost: 0,
        resultImage: '/static/outputs/frame.jpg',
        stepProgress: [] as never,
      },
    });

    const res = await request(app)
      .post('/api/user/video-projects/from-project')
      .set('Cookie', authCookie(userId))
      .send({ projectId: source.id });

    expect(res.status).toBe(201);
    expect(res.body.project.timeline.scenes).toHaveLength(1);
  });

  it('refuses a foreign or unfinished result', async () => {
    const foreign = await prisma.project.create({
      data: {
        userId: otherUserId,
        title: 'Чужой',
        status: 'COMPLETED',
        progress: 100,
        mode: 'free-chat',
        inputImages: [],
        tokensCost: 0,
        resultImage: '/static/outputs/foreign.jpg',
        stepProgress: [] as never,
      },
    });
    const running = await prisma.project.create({
      data: {
        userId,
        title: 'Ещё считается',
        status: 'PROCESSING',
        progress: 40,
        mode: 'free-chat',
        inputImages: [],
        tokensCost: 0,
        stepProgress: [] as never,
      },
    });

    for (const projectId of [foreign.id, running.id]) {
      const res = await request(app)
        .post('/api/user/video-projects/from-project')
        .set('Cookie', authCookie(userId))
        .send({ projectId });
      expect(res.status).toBe(404);
    }
  });
});

describe('POST /api/user/video-projects/:id/voiceover/generate', () => {
  async function ownRoll() {
    return prisma.videoProject.create({
      data: { userId, title: 'Поздравление', timeline: collageTimeline() as never },
    });
  }

  it('charges coins and queues the synthesis', async () => {
    jest.spyOn(queuesModule, 'addServicePipelineJob').mockResolvedValue({} as never);
    const roll = await ownRoll();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const res = await request(app)
      .post(`/api/user/video-projects/${roll.id}/voiceover/generate`)
      .set('Cookie', authCookie(userId))
      .send({ text: 'С днём рождения, мама!', model: 'minimax-speech', emotion: 'happy' });

    expect(res.status).toBe(202);
    expect(res.body.tokensCost).toBe(voiceoverPriceCoins('minimax-speech'));

    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.body.projectId } });
    expect(project.mode).toBe('editor-voiceover');
    // Ролик назван в проекте: воркер впишет дорожку туда, а не в «последний открытый».
    expect(project.userInputs).toEqual(
      expect.objectContaining({ editorVoiceover: expect.objectContaining({ videoProjectId: roll.id }) }),
    );

    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.tokenBalance).toBe(before.tokenBalance - res.body.tokensCost);
  });

  it('returns the coins when the queue is down', async () => {
    jest.spyOn(queuesModule, 'addServicePipelineJob').mockRejectedValue(new Error('redis down'));
    const roll = await ownRoll();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const res = await request(app)
      .post(`/api/user/video-projects/${roll.id}/voiceover/generate`)
      .set('Cookie', authCookie(userId))
      .send({ text: 'С юбилеем!' });

    expect(res.status).toBe(503);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Человек не должен платить за озвучку, которая даже не встала в очередь.
    expect(after.tokenBalance).toBe(before.tokenBalance);
  });

  it('refuses when the balance is too small', async () => {
    const poor = await prisma.user.create({
      data: { email: `video-poor-${RUN_ID}@example.ru`, passwordHash: 'hash', tokenBalance: 0 },
    });
    const roll = await prisma.videoProject.create({
      data: { userId: poor.id, title: 'Без денег', timeline: collageTimeline() as never },
    });

    const res = await request(app)
      .post(`/api/user/video-projects/${roll.id}/voiceover/generate`)
      .set('Cookie', authCookie(poor.id))
      .send({ text: 'Привет' });

    expect(res.status).toBe(402);

    await prisma.videoProject.deleteMany({ where: { userId: poor.id } });
    await prisma.user.delete({ where: { id: poor.id } });
  });
});
