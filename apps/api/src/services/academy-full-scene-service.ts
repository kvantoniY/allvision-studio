import { Prisma, prisma } from '@allvision/database';
import { estimateAcademyGenerationCostUsd, readSceneDocument, type AcademyGenerationInput } from '@allvision/shared';
import { addAcademyGenerationJob } from '../queues';
import { logger } from '../utils/logger';

const FULL_SCENE_MAX_COST = 2;

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
  const scenes = readSceneDocument(instance.version.scene);
  const fullAi = scenes.filter(
    (s) => s.generation?.mode === 'full-ai' && (s.generation.prompt ?? '').trim().length >= 8,
  );
  if (fullAi.length === 0) return;

  const profile = await prisma.characterProfile.findFirst({
    where: { childId: instance.childId, status: 'APPROVED' },
    include: { references: true },
  });
  if (!profile || profile.references.length === 0) {
    logger.warn(`[full-scene] нет APPROVED-персонажа у ребёнка ${instance.childId}; цельные сцены не генерируются`);
    return;
  }
  const characterReferenceIds = profile.references.map((r) => r.id).slice(0, 14);

  const existing = await prisma.lessonInstanceSceneAsset.findMany({ where: { instanceId: instance.id }, select: { sceneId: true } });
  const done = new Set(existing.map((e) => e.sceneId));

  for (const scene of fullAi) {
    if (done.has(scene.id)) continue;
    const input: AcademyGenerationInput = {
      kind: 'scene',
      operation: 'generate',
      title: `Урок-сцена: ${scene.title}`.slice(0, 160),
      prompt: (scene.generation?.prompt ?? '').trim(),
      model: 'nano-banana',
      style: 'cinematic-animation',
      aspectRatio: '16:9',
      quality: 'medium',
      resolution: '1K',
      count: 1,
      transparentBackground: false,
      childId: instance.childId,
      characterReferenceIds,
      referenceAssetIds: [],
      tags: ['lesson-scene'],
      maxCostUsd: FULL_SCENE_MAX_COST,
    };
    const estimatedCostUsd = estimateAcademyGenerationCostUsd(input);
    try {
      const project = await prisma.project.create({
        data: {
          userId: requestedById,
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
      await prisma.lessonInstanceSceneAsset.create({
        data: { instanceId: instance.id, sceneId: scene.id, projectId: project.id },
      });
      await addAcademyGenerationJob({ projectId: project.id, requestedById, input, estimatedCostUsd });
    } catch (err) {
      logger.error(`[full-scene] не удалось запустить генерацию сцены ${scene.id}`, err);
    }
  }
}

export interface FullSceneStatus {
  sceneId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  /** id ChildAsset готовой иллюстрации (для подстановки фоном). */
  childAssetId: string | null;
}

/** Статусы генерации цельных сцен экземпляра (для resolved-сцен и prep-UI). */
export async function fullSceneStatuses(instanceId: string): Promise<Map<string, FullSceneStatus>> {
  const rows = await prisma.lessonInstanceSceneAsset.findMany({ where: { instanceId } });
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
