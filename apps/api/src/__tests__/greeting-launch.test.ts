import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { prisma, ProcessingType } from '@allvision/database';
import { app } from '../app';
import { _resetProvidersForTests } from '../providers';
import { signAccessToken } from '../utils/jwt';
import * as queuesModule from '../queues';

/**
 * Запуск видео-поздравления — услуги с мульти-загрузкой фотографий.
 *
 * Форма и пайплайн взяты один в один с прода: владелец получал на этих услугах ошибку,
 * а обычные одно-фотографийные услуги при этом запускались.
 */

const RUN_ID = Date.now();
const USER_EMAIL = `greeting-launch-${RUN_ID}@example.ru`;

let tmpDir: string;
let originalUploads: string | undefined;
let userId: string;

function authCookie(id: string) {
  return [`accessToken=${signAccessToken(id, 'USER')}`];
}

async function photo() {
  return sharp({ create: { width: 48, height: 48, channels: 3, background: '#33aa88' } })
    .png()
    .toBuffer();
}

const userInputForm = [
  {
    id: 'photos',
    type: 'photos',
    label: 'Фотографии для ролика',
    required: true,
    minPhotos: 4,
    maxPhotos: 12,
    maxSizeMb: 15,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    priceCoinsPerPhoto: 35,
  },
  { id: 'title', type: 'text', label: 'Заголовок ролика', required: false, maxLength: 60 },
  { id: 'subtitle', type: 'text', label: 'Подпись под заголовком', required: false, maxLength: 60 },
  {
    id: 'music',
    type: 'music-select',
    label: 'Музыка',
    required: false,
    mediaKind: 'background-music',
    allowLibrary: true,
    allowUserUpload: false,
  },
  {
    id: 'aspect',
    type: 'aspect_ratio',
    label: 'Формат ролика',
    required: false,
    aspectOptions: ['9:16', '1:1', '16:9'],
    defaultAspect: '9:16',
  },
];

const pipelineConfig = [
  {
    id: 'step_1',
    blockSlug: 'scene-batch',
    params: {
      mode: 'animate',
      model: 'hailuo-2.3-fast',
      photos: '{{user.photos}}',
      prompt: 'Bring this photograph to life with calm motion.',
      duration: 6,
      max_scenes: 12,
      aspect_ratio: '{{user.aspect}}',
    },
  },
  {
    id: 'step_2',
    blockSlug: 'timeline-render',
    params: {
      clips: '{{step_1.output.metadata.clips}}',
      music: '{{user.music}}',
      quality: 'balanced',
      max_scenes: 14,
      photo_motion: true,
      timeline: '{"aspect":"{{user.aspect}}","scenes":[{"id":"scene","source":{"kind":"batch"},"transition":"dissolve"}]}',
    },
  },
];

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'greeting-launch-'));
  originalUploads = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = tmpDir;
  _resetProvidersForTests();

  await prisma.service.deleteMany({ where: { slug: `greeting-${RUN_ID}` } });
  await prisma.service.create({
    data: {
      slug: `greeting-${RUN_ID}`,
      title: 'Ожившие фотографии',
      shortDesc: 'Короткое описание',
      description: 'Описание',
      category: 'NOSTALGIA',
      priceTokens: 35,
      priceCoinsStandard: 35,
      priceCoinsPro: 35,
      costUsd: 0,
      galleryImages: [],
      isActive: true,
      sortOrder: 5000,
      aiProvider: 'mock',
      aiModel: 'mock',
      aiConfig: {},
      processingType: ProcessingType.AUTO,
      pipelineConfig: pipelineConfig as never,
      userInputForm: userInputForm as never,
    },
  });

  const user = await prisma.user.create({
    data: { email: USER_EMAIL, passwordHash: 'hash', tokenBalance: 5000 },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.tokenTransaction.deleteMany({ where: { userId } });
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.service.deleteMany({ where: { slug: `greeting-${RUN_ID}` } });
  process.env.UPLOADS_DIR = originalUploads;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

it('launches a greeting template with a batch of photos', async () => {
  jest.spyOn(queuesModule, 'addServicePipelineJob').mockResolvedValue({} as never);

  const req = request(app)
    .post(`/api/services/greeting-${RUN_ID}/launch`)
    .set('Cookie', authCookie(userId))
    .field('data', JSON.stringify({ title: 'Наша семья', subtitle: '1985 — 2026', music: '', aspect: '9:16' }));

  for (let index = 0; index < 5; index += 1) {
    req.attach('photos', await photo(), { filename: `photo-${index}.png`, contentType: 'image/png' });
  }

  const res = await req;
  expect(res.status).toBe(201);
  // Цена — за каждую фотографию: пять снимков по 35 коинов.
  expect(res.body.project.tokensCost).toBe(175);
});
