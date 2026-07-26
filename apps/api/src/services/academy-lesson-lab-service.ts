import { prisma } from '@allvision/database';
import { readSceneDocument } from '@allvision/shared';

/**
 * Нейролаборатория в уроке: изолированный бюджет токенов на урок. Начисляется ОДИН РАЗ при
 * старте урока (labTokensGranted != null = уже начислено), тратится только внутри урока,
 * кошелёк семьи не трогается. Перенос урока не начисляет повторно (флаг уже выставлен).
 */

type LabConfig = { tokens: number; videoAllowed: boolean };

/** Читает лаборатории из документа урока: суммарный лимит токенов и разрешено ли видео. */
function readLabConfig(sceneDocument: unknown): LabConfig | null {
  const scenes = readSceneDocument(sceneDocument) as Array<{ lab?: { tokens?: number; videoAllowed?: boolean } }>;
  const labs = scenes.filter((s) => s.lab && typeof s.lab.tokens === 'number');
  if (labs.length === 0) return null;
  const tokens = labs.reduce((sum, s) => sum + (s.lab?.tokens ?? 0), 0);
  const videoAllowed = labs.some((s) => s.lab?.videoAllowed !== false);
  return { tokens, videoAllowed };
}

async function lessonSceneDocument(lessonId: string): Promise<unknown | null> {
  const instance = await prisma.lessonInstance.findUnique({
    where: { lessonId },
    select: { version: { select: { scene: true } } },
  });
  return instance?.version.scene ?? null;
}

/** Начисляет бюджет лаборатории при старте урока (идемпотентно). Вызывается при входе учителя. */
export async function grantLessonLabTokens(lessonId: string): Promise<void> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { labTokensGranted: true } });
  if (!lesson || lesson.labTokensGranted !== null) return; // уже начисляли или урока нет

  const doc = await lessonSceneDocument(lessonId);
  const lab = doc ? readLabConfig(doc) : null;
  if (!lab || lab.tokens <= 0) return; // в уроке нет лаборатории

  // Только если всё ещё не начислено (защита от гонки).
  await prisma.lesson.updateMany({
    where: { id: lessonId, labTokensGranted: null },
    data: { labTokensGranted: lab.tokens },
  });
}

export interface LessonLabState {
  hasLab: boolean;
  granted: number | null;
  spent: number;
  remaining: number;
  videoAllowed: boolean;
}

export async function lessonLabState(lessonId: string): Promise<LessonLabState> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { labTokensGranted: true, labTokensSpent: true },
  });
  const doc = await lessonSceneDocument(lessonId);
  const lab = doc ? readLabConfig(doc) : null;
  const granted = lesson?.labTokensGranted ?? null;
  const spent = lesson?.labTokensSpent ?? 0;
  return {
    hasLab: Boolean(lab),
    granted,
    spent,
    remaining: Math.max(0, (granted ?? 0) - spent),
    videoAllowed: lab?.videoAllowed ?? true,
  };
}
