import { Prisma, prisma } from '@allvision/database';
import { estimateAcademyCostUsd, readSceneDocument, type AcademyGenerationInput } from '@allvision/shared';
import { addAcademyGenerationJob } from '../queues';
import { logger } from '../utils/logger';

const FULL_SCENE_MAX_COST = 2;
// Видео дороже картинки: 5–15 сек Kling/Seedance укладываются в этот потолок.
const ELEMENT_VIDEO_MAX_COST = 4;

/**
 * Запускает генерацию цельных AI-сцен экземпляра урока по референсу ученика (A6.6):
 * на каждую сцену с `generation.mode === 'full-ai'` и промптом создаётся
 * academy-generation Project (kind `scene`, персонаж ребёнка) + связка
 * LessonInstanceSceneAsset. Идемпотентно — уже запущенные сцены пропускаются.
 * Без APPROVED-персонажа генерация не запускается (сцена останется абстрактной).
 */
export async function ensureFullAiSceneGenerations(
  instance: { id: string; childId: string; version: { scene: unknown } },
  requestedById: string,
): Promise<void> {
  const fullAi = fullAiScenes(instance.version.scene);
  if (fullAi.length === 0) return;

  const characterReferenceIds = await approvedCharacterRefs(instance.childId);
  if (!characterReferenceIds) return;

  // Только сценовые связки (elementId=''), иначе кат-сцены элементов помешали бы
  // запуску генерации самой сцены.
  const existing = await prisma.lessonInstanceSceneAsset.findMany({
    where: { instanceId: instance.id, elementId: '' },
    select: { sceneId: true },
  });
  const done = new Set(existing.map((e) => e.sceneId));

  for (const scene of fullAi) {
    if (done.has(scene.id)) continue;
    await startSceneGeneration({
      instanceId: instance.id,
      childId: instance.childId,
      sceneId: scene.id,
      sceneTitle: scene.title,
      prompt: (scene.generation?.prompt ?? '').trim(),
      characterReferenceIds,
      requestedById,
    });
  }
}

/** Сцены, которые генерируются целиком по референсу ученика. */
function fullAiScenes(sceneDocument: unknown) {
  return readSceneDocument(sceneDocument).filter(
    (s) => s.generation?.mode === 'full-ai' && (s.generation.prompt ?? '').trim().length >= 8,
  );
}

/** Референсы утверждённого AI-персонажа ребёнка; null — генерировать нечем. */
async function approvedCharacterRefs(childId: string): Promise<string[] | null> {
  const profile = await prisma.characterProfile.findFirst({
    where: { childId, status: 'APPROVED' },
    include: { references: true },
  });
  if (!profile || profile.references.length === 0) {
    logger.warn(`[full-scene] нет APPROVED-персонажа у ребёнка ${childId}; цельные сцены не генерируются`);
    return null;
  }
  return profile.references.map((r) => r.id).slice(0, 14);
}

/**
 * Видео-элементы сцен, которые генерируются под ученика (кат-сцена с ребёнком):
 * в шаблоне у элемента лежит только промпт, материал появляется на экземпляре урока.
 */
function generatedVideoElements(sceneDocument: unknown) {
  return readSceneDocument(sceneDocument).flatMap((scene) =>
    scene.layers.flatMap((layer) => layer.elements)
      .filter((element) => element.type === 'video' && (element.content.generation?.prompt ?? '').trim().length >= 8)
      .map((element) => ({ scene, element })),
  );
}

/**
 * Запускает генерацию персональных кат-сцен (A13). Идемпотентно: уже запущенные
 * элементы пропускаются, поэтому повторная подготовка урока не тратит деньги заново.
 */
export async function ensureElementVideoGenerations(
  instance: { id: string; childId: string; version: { scene: unknown } },
  requestedById: string,
): Promise<void> {
  const targets = generatedVideoElements(instance.version.scene);
  if (targets.length === 0) return;

  const characterReferenceIds = await approvedCharacterRefs(instance.childId);
  if (!characterReferenceIds) return;

  const existing = await prisma.lessonInstanceSceneAsset.findMany({
    where: { instanceId: instance.id, NOT: { elementId: '' } },
    select: { sceneId: true, elementId: true },
  });
  const done = new Set(existing.map((row) => `${row.sceneId}::${row.elementId}`));

  for (const { scene, element } of targets) {
    if (done.has(`${scene.id}::${element.id}`)) continue;
    await startSceneGeneration({
      instanceId: instance.id,
      childId: instance.childId,
      sceneId: scene.id,
      elementId: element.id,
      sceneTitle: element.name || scene.title,
      prompt: (element.content.generation?.prompt ?? '').trim(),
      characterReferenceIds,
      requestedById,
      video: {
        source: element.content.generation?.source ?? 'image',
        durationSec: element.content.generation?.durationSec ?? 5,
      },
    });
  }
}

async function startSceneGeneration(params: {
  instanceId: string;
  childId: string;
  sceneId: string;
  /** Пусто — генерируется сцена целиком; иначе конкретный элемент (кат-сцена). */
  elementId?: string;
  sceneTitle: string;
  prompt: string;
  characterReferenceIds: string[];
  requestedById: string;
  video?: { source: 'image' | 'text'; durationSec: number };
}): Promise<string | null> {
  const video = params.video;
  const input: AcademyGenerationInput = {
    // Кат-сцена сохраняется как `cutscene` в закрытой библиотеке ученика.
    kind: video ? 'cutscene' : 'scene',
    operation: 'generate',
    title: (video ? `Кат-сцена: ${params.sceneTitle}` : `Урок-сцена: ${params.sceneTitle}`).slice(0, 160),
    prompt: params.prompt,
    model: 'nano-banana',
    style: 'cinematic-animation',
    aspectRatio: '16:9',
    quality: 'medium',
    resolution: '1K',
    count: 1,
    transparentBackground: false,
    media: video ? 'video' : 'image',
    // «Оживить портрет» — image-to-video по референсу персонажа, иначе ролик по описанию.
    videoModel: video?.source === 'text' ? 'seedance-2' : 'kling-3-std',
    durationSec: video?.durationSec ?? 5,
    childId: params.childId,
    characterReferenceIds: params.characterReferenceIds,
    referenceAssetIds: [],
    tags: video ? ['lesson-cutscene'] : ['lesson-scene'],
    maxCostUsd: video ? ELEMENT_VIDEO_MAX_COST : FULL_SCENE_MAX_COST,
  };
  const estimatedCostUsd = estimateAcademyCostUsd(input);
  try {
    const project = await prisma.project.create({
      data: {
        userId: params.requestedById,
        mode: 'academy-generation',
        title: input.title,
        status: 'PENDING',
        progress: 0,
        inputImages: [],
        inputText: input.prompt,
        tokensCost: 0,
        userInputs: { academyGeneration: input, estimatedCostUsd } as unknown as Prisma.InputJsonValue,
        pipelineSnapshot: [{ blockSlug: 'academy-generation', params: input }] as unknown as Prisma.InputJsonValue,
      },
    });
    // upsert: перегенерация заменяет связку сцены на новый проект.
    await prisma.lessonInstanceSceneAsset.upsert({
      where: {
        instanceId_sceneId_elementId: {
          instanceId: params.instanceId,
          sceneId: params.sceneId,
          elementId: params.elementId ?? '',
        },
      },
      create: {
        instanceId: params.instanceId,
        sceneId: params.sceneId,
        elementId: params.elementId ?? '',
        projectId: project.id,
      },
      update: { projectId: project.id },
    });
    await addAcademyGenerationJob({ projectId: project.id, requestedById: params.requestedById, input, estimatedCostUsd });
    return project.id;
  } catch (err) {
    logger.error(`[full-scene] не удалось запустить генерацию сцены ${params.sceneId}`, err);
    return null;
  }
}

/**
 * Перегенерация одной цельной AI-сцены — преподаватель может переделать
 * иллюстрацию в любой момент до урока, если результат не понравился.
 * Переделываются только сцены с участием AI-персонажа (`full-ai`).
 */
export async function regenerateFullAiScene(
  instance: { id: string; childId: string; version: { scene: unknown } },
  sceneId: string,
  requestedById: string,
): Promise<{ ok: boolean; reason?: 'SCENE_NOT_AI' | 'CHARACTER_NOT_READY' | 'FAILED' }> {
  const scene = fullAiScenes(instance.version.scene).find((s) => s.id === sceneId);
  if (!scene) return { ok: false, reason: 'SCENE_NOT_AI' };

  const characterReferenceIds = await approvedCharacterRefs(instance.childId);
  if (!characterReferenceIds) return { ok: false, reason: 'CHARACTER_NOT_READY' };

  const projectId = await startSceneGeneration({
    instanceId: instance.id,
    childId: instance.childId,
    sceneId: scene.id,
    sceneTitle: scene.title,
    prompt: (scene.generation?.prompt ?? '').trim(),
    characterReferenceIds,
    requestedById,
  });
  return projectId ? { ok: true } : { ok: false, reason: 'FAILED' };
}

/**
 * Перезапуск персональной кат-сцены отдельного элемента. Нужен после сбоя провайдера:
 * без него упавшая генерация оставалась упавшей навсегда, а в уроке зиял чёрный кадр.
 * startSceneGeneration делает upsert связки, поэтому прошлый провалившийся проект
 * просто заменяется новым.
 */
export async function regenerateElementVideo(
  instance: { id: string; childId: string; version: { scene: unknown } },
  sceneId: string,
  elementId: string,
  requestedById: string,
): Promise<{ ok: boolean; reason?: 'ELEMENT_NOT_GENERATED' | 'CHARACTER_NOT_READY' | 'FAILED' }> {
  const target = generatedVideoElements(instance.version.scene)
    .find((item) => item.scene.id === sceneId && item.element.id === elementId);
  if (!target) return { ok: false, reason: 'ELEMENT_NOT_GENERATED' };

  const characterReferenceIds = await approvedCharacterRefs(instance.childId);
  if (!characterReferenceIds) return { ok: false, reason: 'CHARACTER_NOT_READY' };

  const projectId = await startSceneGeneration({
    instanceId: instance.id,
    childId: instance.childId,
    sceneId: target.scene.id,
    elementId: target.element.id,
    sceneTitle: target.element.name || target.scene.title,
    prompt: (target.element.content.generation?.prompt ?? '').trim(),
    characterReferenceIds,
    requestedById,
    video: {
      source: target.element.content.generation?.source ?? 'image',
      durationSec: target.element.content.generation?.durationSec ?? 5,
    },
  });
  return projectId ? { ok: true } : { ok: false, reason: 'FAILED' };
}

export interface FullSceneStatus {
  sceneId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  /** id ChildAsset готовой иллюстрации (для подстановки фоном). */
  childAssetId: string | null;
}

/** Статус персональной кат-сцены отдельного элемента. */
export interface ElementVideoStatus {
  sceneId: string;
  elementId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  childAssetId: string | null;
  /** Причина отказа — иначе провал генерации виден только в БД. */
  errorMessage: string | null;
}

/**
 * Статусы кат-сцен по элементам: ключ `sceneId::elementId`. Роут подставляет
 * готовые ролики в resolved-сцены, prep-панель показывает прогресс.
 */
export async function elementVideoStatuses(instanceId: string): Promise<Map<string, ElementVideoStatus>> {
  const rows = await prisma.lessonInstanceSceneAsset.findMany({
    where: { instanceId, NOT: { elementId: '' } },
  });
  if (rows.length === 0) return new Map();
  const projects = await prisma.project.findMany({
    where: { id: { in: rows.map((r) => r.projectId) } },
    select: { id: true, status: true, resultAssets: true, errorMessage: true },
  });
  const byId = new Map(projects.map((p) => [p.id, p]));
  const result = new Map<string, ElementVideoStatus>();
  for (const row of rows) {
    const project = byId.get(row.projectId);
    result.set(`${row.sceneId}::${row.elementId}`, {
      sceneId: row.sceneId,
      elementId: row.elementId,
      status: (project?.status as ElementVideoStatus['status']) ?? 'PENDING',
      childAssetId: parseAssetIds(project?.resultAssets)[0] ?? null,
      errorMessage: project?.errorMessage ?? null,
    });
  }
  return result;
}

/** Статусы генерации цельных сцен экземпляра (для resolved-сцен и prep-UI). */
export async function fullSceneStatuses(instanceId: string): Promise<Map<string, FullSceneStatus>> {
  const rows = await prisma.lessonInstanceSceneAsset.findMany({ where: { instanceId, elementId: '' } });
  if (rows.length === 0) return new Map();
  const projects = await prisma.project.findMany({
    where: { id: { in: rows.map((r) => r.projectId) } },
    select: { id: true, status: true, resultAssets: true },
  });
  const byId = new Map(projects.map((p) => [p.id, p]));
  const result = new Map<string, FullSceneStatus>();
  for (const row of rows) {
    const project = byId.get(row.projectId);
    const assetIds = parseAssetIds(project?.resultAssets);
    result.set(row.sceneId, {
      sceneId: row.sceneId,
      status: (project?.status as FullSceneStatus['status']) ?? 'PENDING',
      childAssetId: assetIds[0] ?? null,
    });
  }
  return result;
}

function parseAssetIds(resultAssets: unknown): string[] {
  if (!Array.isArray(resultAssets)) return [];
  return resultAssets
    .map((a) => (a && typeof a === 'object' && 'assetId' in a ? String((a as { assetId: unknown }).assetId) : typeof a === 'string' ? a : null))
    .filter((x): x is string => Boolean(x));
}
