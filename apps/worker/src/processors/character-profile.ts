import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import { prisma } from '@allvision/database';
import {
  CHARACTER_PROFILE_DEFAULT_MAX_USD,
  CHARACTER_PROFILE_DEFAULT_MODEL,
  CHARACTER_REF_KINDS,
  CHARACTER_REF_PROMPTS,
  type CharacterProfileJobData,
  type CharacterRefKind,
} from '@allvision/shared';
import { getAIProvider } from '../providers';
import { publishProjectEvent } from '../utils/project-events';
import { resolveWorkspacePath } from '../utils/paths';
import { readChildPhoto, writeCharacterRef, deleteCharacterRef } from '../utils/private-storage';
import { logger } from '../utils/logger';

const MAX_INPUT_PHOTOS = 3;
const INPUT_MAX_DIM = 1600;

// 1x1 png для stub-провайдера в тестах (никаких сетевых/файловых зависимостей).
const STUB_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function maxBudgetUsd(): number {
  const raw = Number(process.env.CHARACTER_PROFILE_MAX_USD ?? CHARACTER_PROFILE_DEFAULT_MAX_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : CHARACTER_PROFILE_DEFAULT_MAX_USD;
}

function modelSlug(): string {
  return process.env.CHARACTER_PROFILE_MODEL ?? CHARACTER_PROFILE_DEFAULT_MODEL;
}

export async function toDataUri(buffer: Buffer): Promise<string> {
  const prepared = await sharp(buffer)
    .rotate()
    .resize(INPUT_MAX_DIM, INPUT_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()
    .catch(() => buffer);
  return `data:image/jpeg;base64,${prepared.toString('base64')}`;
}

/** Достаёт байты результата провайдера: data-uri, stub, локальный /static или внешний URL. */
export async function readOutputBytes(outputUrl: string): Promise<{ buffer: Buffer; cleanup?: () => Promise<void> }> {
  if (outputUrl.startsWith('data:')) {
    const base64 = outputUrl.slice(outputUrl.indexOf(',') + 1);
    return { buffer: Buffer.from(base64, 'base64') };
  }
  if (outputUrl.startsWith('stub://')) {
    return { buffer: STUB_PIXEL };
  }
  const marker = '/static/';
  const markerIdx = outputUrl.indexOf(marker);
  if (markerIdx >= 0) {
    const key = decodeURIComponent(outputUrl.slice(markerIdx + marker.length)).replace(/^\/+/, '');
    const rootDir = resolveWorkspacePath(process.env.UPLOADS_DIR ?? './uploads');
    const target = path.resolve(rootDir, key);
    if (!target.startsWith(rootDir + path.sep)) throw new Error(`INVALID_OUTPUT_KEY: ${key}`);
    const buffer = await fs.readFile(target);
    // Детский контент не должен оставаться в публичном uploads — подчищаем копию.
    return { buffer, cleanup: async () => fs.unlink(target).catch(() => undefined) };
  }
  const res = await fetch(outputUrl);
  if (!res.ok) throw new Error(`OUTPUT_DOWNLOAD_FAILED: HTTP ${res.status}`);
  return { buffer: Buffer.from(await res.arrayBuffer()) };
}

function publishStatus(projectId: string, userId: string, status: string, progress: number, kind: 'status' | 'progress') {
  publishProjectEvent({ projectId, userId, status, progress, kind });
}

export async function processCharacterProfile(job: Job<CharacterProfileJobData>) {
  const { characterProfileId } = job.data;
  const profile = await prisma.characterProfile.findUnique({
    where: { id: characterProfileId },
    include: {
      child: { include: { photos: { orderBy: { createdAt: 'asc' } }, parent: { select: { id: true } } } },
    },
  });
  if (!profile) {
    logger.warn(`[character-profile] profile ${characterProfileId} not found, skipping`);
    return;
  }

  const parentId = profile.child.parent.id;
  const childId = profile.childId;
  // Контейнер генерации — Project (FK для AIUsageLog, SSE, admin-observability).
  const project = await prisma.project.findFirst({
    where: { mode: 'character-profile', userId: parentId, inputText: profile.id, status: { in: ['PENDING', 'PROCESSING'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!project) {
    logger.warn(`[character-profile] no pending project for profile ${profile.id}, skipping`);
    return;
  }

  const requestedKinds: CharacterRefKind[] = (job.data.kinds?.length
    ? job.data.kinds.filter((k): k is CharacterRefKind => (CHARACTER_REF_KINDS as readonly string[]).includes(k))
    : [...CHARACTER_REF_KINDS]);

  const failProfile = async (message: string) => {
    await prisma.characterProfile.update({
      where: { id: profile.id },
      data: { status: 'FAILED', errorMessage: message },
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { status: 'FAILED', errorMessage: message, errorCode: 'CHARACTER_PROFILE_FAILED' },
    });
    publishStatus(project.id, parentId, 'FAILED', 0, 'status');
  };

  try {
    if (profile.child.photos.length === 0) {
      await failProfile('Нет фотографий ребёнка для создания персонажа');
      return;
    }

    await prisma.characterProfile.update({
      where: { id: profile.id },
      data: { status: 'GENERATING', progress: 0, errorMessage: null },
    });
    await prisma.project.update({ where: { id: project.id }, data: { status: 'PROCESSING', progress: 0 } });
    publishStatus(project.id, parentId, 'PROCESSING', 0, 'status');

    // Референсы личности: до 3 фото, EXIF-поворот + downscale, в data-uri
    const photoBuffers = await Promise.all(
      profile.child.photos.slice(0, MAX_INPUT_PHOTOS).map((photo) => readChildPhoto(photo.storageKey)),
    );
    const photoRefs = await Promise.all(photoBuffers.map((buf) => toDataUri(buf)));

    const provider = getAIProvider('image-edit');
    const model = modelSlug();
    const budget = maxBudgetUsd();
    let spentUsd = 0;

    for (let i = 0; i < requestedKinds.length; i += 1) {
      const kind = requestedKinds[i];
      if (spentUsd >= budget) {
        throw new Error(`CHARACTER_BUDGET_EXCEEDED: $${spentUsd.toFixed(2)} >= $${budget}`);
      }

      const result = await provider.imageEdit({
        imageUrl: photoRefs[0],
        prompt: CHARACTER_REF_PROMPTS[kind],
        model,
        params: {
          image_urls: photoRefs.slice(1),
          resolution: '2K',
          aspect_ratio: kind === 'full_body' || kind === 'neutral_pose' ? '3:4' : '1:1',
        },
        context: {
          projectId: project.id,
          userId: parentId,
          blockSlug: 'character-profile',
          stepId: kind,
          reportProgress: async (percent) => {
            const total = Math.round(((i + percent / 100) / requestedKinds.length) * 100);
            await prisma.characterProfile.update({ where: { id: profile.id }, data: { progress: total } }).catch(() => undefined);
            publishStatus(project.id, parentId, 'PROCESSING', total, 'progress');
          },
        },
      });
      spentUsd += result.costUsd;

      const output = await readOutputBytes(result.outputUrl);
      const metadata = await sharp(output.buffer).metadata().catch(() => undefined);
      const storageKey = path.posix.join(parentId, childId, `${kind}-${crypto.randomUUID()}.jpg`);
      await writeCharacterRef(storageKey, output.buffer);
      await output.cleanup?.();

      // Перегенерация kind'а заменяет старые референсы этого вида (файлы тоже).
      const stale = await prisma.characterReference.findMany({ where: { profileId: profile.id, kind } });
      await prisma.characterReference.deleteMany({ where: { profileId: profile.id, kind } });
      await Promise.all(stale.map((ref) => deleteCharacterRef(ref.storageKey)));

      await prisma.characterReference.create({
        data: {
          profileId: profile.id,
          kind,
          storageKey,
          mimeType: 'image/jpeg',
          width: metadata?.width ?? null,
          height: metadata?.height ?? null,
          promptUsed: CHARACTER_REF_PROMPTS[kind],
          model,
          costUsd: result.costUsd,
        },
      });

      const totalProgress = Math.round(((i + 1) / requestedKinds.length) * 100);
      await prisma.characterProfile.update({ where: { id: profile.id }, data: { progress: totalProgress } });
      await prisma.project.update({ where: { id: project.id }, data: { progress: totalProgress } });
      publishStatus(project.id, parentId, 'PROCESSING', totalProgress, 'progress');
    }

    await prisma.characterProfile.update({
      where: { id: profile.id },
      data: { status: 'READY', progress: 100 },
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { status: 'COMPLETED', progress: 100, completedAt: new Date() },
    });
    publishStatus(project.id, parentId, 'COMPLETED', 100, 'status');
    logger.info(`[character-profile] profile ${profile.id} ready, spent ~$${spentUsd.toFixed(2)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[character-profile] profile ${profile.id} failed: ${message}`);
    await failProfile(
      message.startsWith('CHARACTER_BUDGET_EXCEEDED')
        ? 'Превышен лимит стоимости генерации персонажа — обратитесь в поддержку'
        : 'Не удалось создать персонажа — попробуйте ещё раз или обратитесь в поддержку',
    );
  }
}
