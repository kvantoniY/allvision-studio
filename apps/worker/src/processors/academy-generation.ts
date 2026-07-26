import crypto from 'node:crypto';
import path from 'node:path';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import { Prisma, prisma } from '@allvision/database';
import {
  ACADEMY_BACKGROUND_REMOVAL_ENDPOINT,
  ACADEMY_BACKGROUND_REMOVAL_ESTIMATED_USD,
  academyGenerationSchema,
  academyVideoModel,
  buildAcademyGenerationPrompt,
  generationKindToAsset,
  type AcademyGenerationJobData,
  type AcademyGenerationInput,
} from '@allvision/shared';
import { getAIProvider, getStorageProvider } from '../providers';
import type { AIProvider, ProviderResult } from '../providers/ai-provider';
import { createAIUsageLog } from '../providers/usage-limits';
import { readOutputBytes } from './character-profile';
import { readCharacterRef, writeChildAsset } from '../utils/private-storage';
import { logger } from '../utils/logger';

const INPUT_MAX_DIM = 2048;

export async function academyReferenceToDataUri(buffer: Buffer): Promise<string> {
  const prepared = await sharp(buffer)
    .rotate()
    .resize(INPUT_MAX_DIM, INPUT_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()
    .catch(() => buffer);
  return `data:image/jpeg;base64,${prepared.toString('base64')}`;
}

export async function prepareAcademyImage(buffer: Buffer, transparent: boolean): Promise<{
  buffer: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  extension: 'png' | 'jpg';
  width: number | null;
  height: number | null;
}> {
  const pipeline = sharp(buffer).rotate();
  const output = transparent
    ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
    : await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  const metadata = await sharp(output).metadata();
  return {
    buffer: output,
    mimeType: transparent ? 'image/png' : 'image/jpeg',
    extension: transparent ? 'png' : 'jpg',
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  };
}

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function logLocalProviderCall(params: {
  provider: AIProvider;
  result: ProviderResult;
  projectId: string;
  userId: string;
  model: string;
  stepId: string;
  request: Record<string, unknown>;
}) {
  // fal/PiAPI пишут лог внутри провайдера. Mock/Stub сетевого раннера не имеют,
  // поэтому фиксируем их вызовы здесь, чтобы AIUsageLog был полным и в mock-first режиме.
  if (params.provider.name !== 'mock' && params.provider.name !== 'stub') return;
  await createAIUsageLog({
    projectId: params.projectId,
    userId: params.userId,
    blockSlug: 'academy-generation',
    provider: params.provider.name,
    model: params.model,
    status: 'success',
    costUsd: params.result.costUsd,
    durationMs: params.result.durationMs,
    requestPayload: { stepId: params.stepId, ...params.request },
    responsePayload: params.result.meta,
  });
}

async function updateProgress(projectId: string, progress: number) {
  await prisma.project.update({ where: { id: projectId }, data: { progress } });
}

async function applyTransparentBackground(params: {
  result: ProviderResult;
  projectId: string;
  userId: string;
  stepId: string;
  privateOutput: boolean;
}): Promise<{ result: ProviderResult; provider: AIProvider }> {
  const provider = getAIProvider('fal-generic');
  const result = await provider.falRaw({
    endpoint: ACADEMY_BACKGROUND_REMOVAL_ENDPOINT,
    kind: 'image',
    falInput: {
      image_url: params.result.outputUrl,
      model: 'General Use (Light)',
      operating_resolution: '1024x1024',
      refine_foreground: true,
      output_format: 'png',
    },
    estimatedCostUsd: ACADEMY_BACKGROUND_REMOVAL_ESTIMATED_USD,
    context: {
      projectId: params.projectId,
      userId: params.userId,
      blockSlug: 'academy-generation',
      stepId: `${params.stepId}-remove-background`,
      privateOutput: params.privateOutput,
    },
  });
  await logLocalProviderCall({
    provider,
    result,
    projectId: params.projectId,
    userId: params.userId,
    model: ACADEMY_BACKGROUND_REMOVAL_ENDPOINT,
    stepId: `${params.stepId}-remove-background`,
    request: { operation: 'remove-background' },
  });
  return { result, provider };
}

async function loadReferences(input: AcademyGenerationInput) {
  const publicAssets = input.referenceAssetIds.length > 0
    ? await prisma.mediaAsset.findMany({
        where: { id: { in: unique(input.referenceAssetIds) }, isActive: true },
        select: { id: true, publicUrl: true },
      })
    : [];
  if (publicAssets.length !== unique(input.referenceAssetIds).length) {
    throw new Error('REFERENCE_ASSET_NOT_FOUND');
  }

  if (!input.childId) {
    return { urls: publicAssets.map((asset) => asset.publicUrl), sourceRefIds: [] as string[], child: null };
  }

  const child = await prisma.childProfile.findFirst({
    where: { id: input.childId, deletedAt: null },
    select: {
      id: true,
      parentId: true,
      characterProfile: {
        select: {
          status: true,
          references: {
            where: input.characterReferenceIds.length > 0
              ? { id: { in: unique(input.characterReferenceIds) } }
              : undefined,
            orderBy: { createdAt: 'asc' },
            select: { id: true, storageKey: true },
          },
        },
      },
    },
  });
  if (!child) throw new Error('CHILD_NOT_FOUND');
  if (child.characterProfile?.status !== 'APPROVED') throw new Error('CHARACTER_NOT_APPROVED');
  const refs = child.characterProfile.references;
  if (refs.length === 0 || (input.characterReferenceIds.length > 0 && refs.length !== unique(input.characterReferenceIds).length)) {
    throw new Error('CHARACTER_REFERENCES_NOT_FOUND');
  }
  const privateUrls = await Promise.all(refs.map(async (ref) => academyReferenceToDataUri(await readCharacterRef(ref.storageKey))));
  return {
    urls: [...privateUrls, ...publicAssets.map((asset) => asset.publicUrl)],
    sourceRefIds: refs.map((ref) => ref.id),
    child,
  };
}

/** Кат-сцена как видео: оживляет референс (image-to-video) или генерирует по промпту (text-to-video). */
async function generateAcademyVideo(params: {
  input: AcademyGenerationInput;
  projectId: string;
  requestedById: string;
  refs: Awaited<ReturnType<typeof loadReferences>>;
  target: ReturnType<typeof generationKindToAsset>;
  prompt: string;
  createdAssets: Array<{ type: string; assetId: string; url?: string }>;
}): Promise<number> {
  const { input, projectId, requestedById, refs, target, prompt, createdAssets } = params;
  const meta = academyVideoModel(input.videoModel);
  if (!meta) throw new Error('VIDEO_MODEL_UNKNOWN');
  const provider = getAIProvider(meta.block);
  if (target.scope === 'child' && provider.name === 'piapi') throw new Error('PERSONAL_GENERATION_REQUIRES_FAL');

  const stepId = `${input.kind}-video`;
  const context = {
    projectId,
    userId: requestedById,
    blockSlug: 'academy-generation',
    stepId,
    privateOutput: target.scope === 'child',
    reportProgress: async (percent: number) => {
      await updateProgress(projectId, Math.round(percent * 0.9)).catch(() => undefined);
    },
  };

  let result: ProviderResult;
  if (meta.source === 'image') {
    const imageUrl = refs.urls[0];
    if (!imageUrl) throw new Error('VIDEO_REFERENCE_REQUIRED');
    result = await provider.imageToVideo({
      imageUrl,
      prompt,
      durationSec: input.durationSec,
      model: meta.slug,
      params: { aspect_ratio: input.aspectRatio, image_urls: refs.urls.slice(1) },
      context,
    });
  } else {
    result = await provider.textToVideo({
      prompt,
      durationSec: input.durationSec,
      model: meta.slug,
      params: { aspect_ratio: input.aspectRatio },
      context,
    });
  }
  await logLocalProviderCall({
    provider,
    result,
    projectId,
    userId: requestedById,
    model: meta.slug,
    stepId,
    request: { kind: input.kind, media: 'video', durationSec: input.durationSec },
  });

  const cost = result.costUsd;
  if (cost > input.maxCostUsd) throw new Error('ACADEMY_GENERATION_BUDGET_EXCEEDED');

  const output = await readOutputBytes(result.outputUrl);
  const buffer = output.buffer;
  const tags = unique([...input.tags, 'academy', 'generated', 'video', `project:${projectId}`, `operation:${input.operation}`]);

  if (target.scope === 'child' && refs.child) {
    const storageKey = path.posix.join(refs.child.parentId, refs.child.id, `${crypto.randomUUID()}.mp4`);
    await writeChildAsset(storageKey, buffer);
    const asset = await prisma.childAsset.create({
      data: {
        childId: refs.child.id,
        createdById: requestedById,
        kind: target.assetKind,
        title: input.title,
        description: input.prompt,
        tags,
        storageKey,
        mimeType: 'video/mp4',
        fileSize: buffer.length,
        width: null,
        height: null,
        generationModel: meta.slug,
        generationPrompt: prompt,
        generationCostUsd: cost,
        generationParams: safeJson(input),
        sourceRefIds: refs.sourceRefIds,
        generationProjectId: projectId,
      },
    });
    createdAssets.push({ type: 'academy-child-asset', assetId: asset.id });
  } else {
    const storageKey = path.posix.join('academy', 'library', requestedById, `${crypto.randomUUID()}.mp4`);
    const uploaded = await getStorageProvider().upload({ key: storageKey, body: buffer, contentType: 'video/mp4' });
    const publicSort = await prisma.mediaAsset.aggregate({
      where: { ownerUserId: requestedById, kind: target.assetKind },
      _max: { sortOrder: true },
    });
    const asset = await prisma.mediaAsset.create({
      data: {
        kind: target.assetKind,
        groupCode: 'academy',
        title: input.title,
        description: input.prompt,
        tags,
        ownerUserId: requestedById,
        storageKey: uploaded.key,
        publicUrl: uploaded.url,
        thumbnailKey: null,
        width: null,
        height: null,
        fileSize: buffer.length,
        mimeType: 'video/mp4',
        isActive: true,
        sortOrder: (publicSort._max.sortOrder ?? 0) + 10,
        generationModel: meta.slug,
        generationPrompt: prompt,
        generationCostUsd: cost,
        generationParams: safeJson(input),
      },
    });
    createdAssets.push({ type: 'academy-media-asset', assetId: asset.id, url: asset.publicUrl });
  }
  await output.cleanup?.();
  await updateProgress(projectId, 100);
  return cost;
}

export async function processAcademyGeneration(job: Job<AcademyGenerationJobData>) {
  const parsed = academyGenerationSchema.parse(job.data.input);
  const input: AcademyGenerationInput = parsed.operation === 'transparent-background'
    ? { ...parsed, transparentBackground: true }
    : parsed;
  const project = await prisma.project.findFirst({
    where: { id: job.data.projectId, userId: job.data.requestedById, mode: 'academy-generation' },
  });
  if (!project) {
    logger.warn(`[academy-generation] project ${job.data.projectId} not found, skipping`);
    return;
  }

  const createdAssets: Array<{ type: string; assetId: string; url?: string }> = [];
  try {
    await prisma.project.update({
      where: { id: project.id },
      data: { status: 'PROCESSING', progress: 0, errorMessage: null, errorCode: null },
    });

    const target = generationKindToAsset(input.kind);
    const refs = await loadReferences(input);
    if (target.scope === 'child' && !refs.child) throw new Error('CHILD_REQUIRED');
    const prompt = buildAcademyGenerationPrompt(input);
    let totalCostUsd = 0;

    if (input.media === 'video') {
      totalCostUsd = await generateAcademyVideo({ input, projectId: project.id, requestedById: job.data.requestedById, refs, target, prompt, createdAssets });
      await prisma.project.update({
        where: { id: project.id },
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedAt: new Date(),
          resultVideo: target.scope === 'teacher' ? createdAssets[0]?.url ?? null : null,
          resultAssets: safeJson(createdAssets),
          aiProviderLogs: safeJson({ estimatedCostUsd: job.data.estimatedCostUsd, actualCostUsd: totalCostUsd }),
        },
      });
      logger.info(`[academy-generation] project ${project.id} completed video, $${totalCostUsd.toFixed(4)}`);
      return;
    }

    const provider = getAIProvider('image-edit');
    if (target.scope === 'child' && provider.name === 'piapi') {
      // PiAPI image-edit публикует входные refs во временный public R2 и сохраняет output
      // в uploads. Для детских материалов разрешены только fal (data-uri refs + privateOutput),
      // mock и stub. Прод Academy работает через PROVIDER_MODE=fal.
      throw new Error('PERSONAL_GENERATION_REQUIRES_FAL');
    }
    const publicSort = target.scope === 'teacher'
      ? await prisma.mediaAsset.aggregate({
          where: { ownerUserId: job.data.requestedById, kind: target.assetKind },
          _max: { sortOrder: true },
        })
      : null;

    for (let index = 0; index < input.count; index += 1) {
      const stepId = `${input.kind}-${index + 1}`;
      const generated = await provider.imageEdit({
        imageUrl: refs.urls[0],
        prompt,
        model: input.model,
        params: {
          image_urls: refs.urls.slice(1),
          aspect_ratio: input.aspectRatio,
          quality: input.quality,
          resolution: input.resolution,
          output_format: input.transparentBackground ? 'png' : 'jpg',
          num_images: 1,
        },
        context: {
          projectId: project.id,
          userId: job.data.requestedById,
          blockSlug: 'academy-generation',
          stepId,
          privateOutput: target.scope === 'child',
          reportProgress: async (percent) => {
            const overall = Math.round(((index + percent / 100) / input.count) * 90);
            await updateProgress(project.id, overall).catch(() => undefined);
          },
        },
      });
      await logLocalProviderCall({
        provider,
        result: generated,
        projectId: project.id,
        userId: job.data.requestedById,
        model: input.model,
        stepId,
        request: { kind: input.kind, operation: input.operation, aspectRatio: input.aspectRatio },
      });

      let finalResult = generated;
      let firstCleanup: (() => Promise<void>) | undefined;
      let assetCostUsd = generated.costUsd;
      if (input.transparentBackground) {
        // fal BiRefNet v2 даёт настоящий alpha PNG. В mock/test это второй безопасный stub-вызов.
        const firstOutput = await readOutputBytes(generated.outputUrl);
        firstCleanup = firstOutput.cleanup;
        const removed = await applyTransparentBackground({
          result: generated,
          projectId: project.id,
          userId: job.data.requestedById,
          stepId,
          privateOutput: target.scope === 'child',
        });
        finalResult = removed.result;
        assetCostUsd += removed.result.costUsd;
      }
      totalCostUsd += assetCostUsd;
      if (totalCostUsd > input.maxCostUsd) {
        await firstCleanup?.();
        throw new Error('ACADEMY_GENERATION_BUDGET_EXCEEDED');
      }

      const output = await readOutputBytes(finalResult.outputUrl);
      const prepared = await prepareAcademyImage(output.buffer, input.transparentBackground);
      await output.cleanup?.();
      await firstCleanup?.();
      const title = input.count > 1 ? `${input.title} · ${index + 1}` : input.title;
      const tags = unique([
        ...input.tags,
        'academy',
        'generated',
        `project:${project.id}`,
        `operation:${input.operation}`,
      ]);

      if (target.scope === 'child' && refs.child) {
        const storageKey = path.posix.join(
          refs.child.parentId,
          refs.child.id,
          `${crypto.randomUUID()}.${prepared.extension}`,
        );
        await writeChildAsset(storageKey, prepared.buffer);
        const asset = await prisma.childAsset.create({
          data: {
            childId: refs.child.id,
            createdById: job.data.requestedById,
            kind: target.assetKind,
            title,
            description: input.prompt,
            tags,
            storageKey,
            mimeType: prepared.mimeType,
            fileSize: prepared.buffer.length,
            width: prepared.width,
            height: prepared.height,
            generationModel: input.model,
            generationPrompt: prompt,
            generationCostUsd: assetCostUsd,
            generationParams: safeJson(input),
            sourceRefIds: refs.sourceRefIds,
            // unique поле привязано к первому результату; остальные находятся через tags/resultAssets.
            generationProjectId: index === 0 ? project.id : null,
          },
        });
        createdAssets.push({ type: 'academy-child-asset', assetId: asset.id });
      } else {
        const storageKey = path.posix.join(
          'academy',
          'library',
          job.data.requestedById,
          `${crypto.randomUUID()}.${prepared.extension}`,
        );
        const uploaded = await getStorageProvider().upload({
          key: storageKey,
          body: prepared.buffer,
          contentType: prepared.mimeType,
        });
        const asset = await prisma.mediaAsset.create({
          data: {
            kind: target.assetKind,
            groupCode: 'academy',
            title,
            description: input.prompt,
            tags,
            ownerUserId: job.data.requestedById,
            storageKey: uploaded.key,
            publicUrl: uploaded.url,
            thumbnailKey: null,
            width: prepared.width,
            height: prepared.height,
            fileSize: prepared.buffer.length,
            mimeType: prepared.mimeType,
            isActive: true,
            sortOrder: (publicSort?._max.sortOrder ?? 0) + ((index + 1) * 10),
            generationModel: input.model,
            generationPrompt: prompt,
            generationCostUsd: assetCostUsd,
            generationParams: safeJson(input),
          },
        });
        createdAssets.push({ type: 'academy-media-asset', assetId: asset.id, url: asset.publicUrl });
      }

      await updateProgress(project.id, Math.round(((index + 1) / input.count) * 100));
    }

    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedAt: new Date(),
        resultImage: target.scope === 'teacher' ? createdAssets[0]?.url ?? null : null,
        resultAssets: safeJson(createdAssets),
        aiProviderLogs: safeJson({ estimatedCostUsd: job.data.estimatedCostUsd, actualCostUsd: totalCostUsd }),
      },
    });
    logger.info(`[academy-generation] project ${project.id} completed, ${createdAssets.length} asset(s), $${totalCostUsd.toFixed(4)}`);
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    const publicMessage = code === 'ACADEMY_GENERATION_BUDGET_EXCEEDED'
      ? 'Фактическая стоимость превысила заданный лимит'
      : code === 'CHARACTER_NOT_APPROVED'
        ? 'Сначала утвердите AI-персонажа ребёнка'
        : code === 'PERSONAL_GENERATION_REQUIRES_FAL'
          ? 'Персональная генерация временно доступна только через защищённый fal-режим'
        : 'Не удалось создать материал — попробуйте ещё раз';
    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: 'FAILED',
        errorCode: code.slice(0, 100),
        errorMessage: publicMessage,
        resultAssets: createdAssets.length > 0 ? safeJson(createdAssets) : undefined,
      },
    }).catch(() => undefined);
    logger.error(`[academy-generation] project ${project.id} failed: ${code}`);
    throw error;
  }
}
