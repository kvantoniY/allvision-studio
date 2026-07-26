import { Router, type NextFunction, type Request, type Response } from 'express';
import sharp from 'sharp';
import { prisma } from '@allvision/database';
import {
  acceptConsentsSchema,
  CHARACTER_REF_KINDS,
  CHARACTER_REF_LABELS,
  CHILD_PHOTOS_MAX,
  CONSENT_CURRENT_VERSION,
  CONSENT_TYPES,
  consentTextSnapshot,
  createChildProfileSchema,
  enrollChildSchema,
  hasAllPhotoConsents,
  updateChildProfileSchema,
  type CharacterProfileDto,
  type CharacterRefKind,
  type ChildPhotoDto,
  type ChildProfileDto,
} from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { requireParent } from '../middleware/require-role';
import { uploadChildPhotos } from '../middleware/upload';
import { HttpError } from '../utils/http-error';
import {
  deleteChildPhoto,
  deleteCharacterRefFile,
  readCharacterRef,
  readChildPhoto,
  saveChildPhoto,
} from '../services/child-photo-storage';
import { addCharacterProfileJob } from '../queues';
import { buildChildProgress } from '../services/academy-progress-service';
import { buildChildLessonHistory } from '../services/academy-teacher-students-service';
import { getDeletionLog, requestChildDeletion } from '../services/academy-deletion-service';

export const familyRouter = Router();

familyRouter.use(requireAuth, requireParent);

const childInclude = {
  consents: true,
  characterProfile: { select: { status: true } },
  _count: { select: { photos: true } },
} as const;

type ChildWithMeta = Awaited<ReturnType<typeof findOwnedChild>>;

async function findOwnedChild(parentId: string, childId: string) {
  const child = await prisma.childProfile.findFirst({
    where: { id: childId, parentId, deletedAt: null },
    include: childInclude,
  });
  if (!child) throw new HttpError(404, 'CHILD_NOT_FOUND', 'Профиль ребёнка не найден');
  return child;
}

function photoFileUrl(childId: string, photoId: string) {
  return `/api/family/children/${childId}/photos/${photoId}/file`;
}

function toChildDto(child: NonNullable<ChildWithMeta>): ChildProfileDto {
  const consents = child.consents.map((consent) => ({
    type: consent.type,
    version: consent.version,
    textSnapshot: consent.textSnapshot,
    acceptedAt: consent.acceptedAt.toISOString(),
    revokedAt: consent.revokedAt ? consent.revokedAt.toISOString() : null,
  }));
  const consentsComplete = hasAllPhotoConsents(consents);
  const characterStatus = (child.characterProfile?.status ?? null) as ChildProfileDto['characterStatus'];
  return {
    id: child.id,
    name: child.name,
    birthDate: child.birthDate ? child.birthDate.toISOString().slice(0, 10) : null,
    avatar: child.avatar,
    notes: child.notes,
    level: child.level,
    xp: child.xp,
    streakCount: child.streakCount,
    createdAt: child.createdAt.toISOString(),
    consents,
    photosCount: child._count.photos,
    photoConsentsComplete: consentsComplete,
    characterStatus,
    // Урок строится вокруг AI-персонажа ребёнка, поэтому запись открывается только
    // после принятых согласий и утверждённого персонажа.
    readyForLessons: consentsComplete && characterStatus === 'APPROVED',
  };
}

function toPhotoDto(photo: {
  id: string;
  childId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
}): ChildPhotoDto {
  return {
    id: photo.id,
    fileName: photo.fileName,
    mimeType: photo.mimeType,
    fileSize: photo.fileSize,
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt.toISOString(),
    fileUrl: photoFileUrl(photo.childId, photo.id),
  };
}

// === Каталог курсов для записи (родитель) ===

familyRouter.get('/courses', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const subjects = await prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        iconName: true,
        courses: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, title: true, level: true, ageMin: true, ageMax: true, description: true },
        },
      },
    });
    res.json({ subjects: subjects.filter((s) => s.courses.length > 0) });
  } catch (err) {
    next(err);
  }
});

// === Дети ===

familyRouter.get('/children', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const children = await prisma.childProfile.findMany({
      where: { parentId: req.user!.id, deletedAt: null },
      include: childInclude,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ items: children.map(toChildDto) });
  } catch (err) {
    next(err);
  }
});

familyRouter.post('/children', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createChildProfileSchema.parse(req.body);
    const child = await prisma.childProfile.create({
      data: {
        parentId: req.user!.id,
        name: data.name,
        birthDate: data.birthDate ? new Date(`${data.birthDate}T00:00:00Z`) : null,
        notes: data.notes ?? null,
      },
      include: childInclude,
    });
    res.status(201).json(toChildDto(child));
  } catch (err) {
    next(err);
  }
});

familyRouter.patch('/children/:childId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateChildProfileSchema.parse(req.body);
    await findOwnedChild(req.user!.id, req.params.childId);
    const child = await prisma.childProfile.update({
      where: { id: req.params.childId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.birthDate !== undefined
          ? { birthDate: data.birthDate ? new Date(`${data.birthDate}T00:00:00Z`) : null }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: childInclude,
    });
    res.json(toChildDto(child));
  } catch (err) {
    next(err);
  }
});

familyRouter.delete('/children/:childId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deletion = await requestChildDeletion(req.user!.id, req.params.childId);
    res.status(202).json({ ok: true, deletion });
  } catch (err) {
    next(err);
  }
});

familyRouter.get('/deletions/:deletionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ deletion: await getDeletionLog(req.user!.id, req.params.deletionId) });
  } catch (err) {
    next(err);
  }
});

// === Согласия ===

familyRouter.post('/children/:childId/consents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { types } = acceptConsentsSchema.parse(req.body);
    await findOwnedChild(req.user!.id, req.params.childId);
    for (const type of types) {
      await prisma.consent.upsert({
        where: { childId_type: { childId: req.params.childId, type } },
        create: {
          parentId: req.user!.id,
          childId: req.params.childId,
          type,
          version: CONSENT_CURRENT_VERSION,
          textSnapshot: consentTextSnapshot(type),
        },
        update: {
          acceptedAt: new Date(),
          revokedAt: null,
          version: CONSENT_CURRENT_VERSION,
          textSnapshot: consentTextSnapshot(type),
        },
      });
    }
    const child = await findOwnedChild(req.user!.id, req.params.childId);
    res.json(toChildDto(child));
  } catch (err) {
    next(err);
  }
});

familyRouter.delete('/children/:childId/consents/:type', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.params.type as (typeof CONSENT_TYPES)[number];
    if (!CONSENT_TYPES.includes(type)) {
      throw new HttpError(400, 'INVALID_CONSENT_TYPE', 'Неизвестный тип согласия');
    }
    await findOwnedChild(req.user!.id, req.params.childId);
    await prisma.consent.updateMany({
      where: { childId: req.params.childId, type },
      data: { revokedAt: new Date() },
    });
    const child = await findOwnedChild(req.user!.id, req.params.childId);
    res.json(toChildDto(child));
  } catch (err) {
    next(err);
  }
});

// === Фотографии ===

familyRouter.get('/children/:childId/photos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedChild(req.user!.id, req.params.childId);
    const photos = await prisma.childPhoto.findMany({
      where: { childId: req.params.childId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ items: photos.map(toPhotoDto) });
  } catch (err) {
    next(err);
  }
});

familyRouter.post(
  '/children/:childId/photos',
  uploadChildPhotos,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const child = await findOwnedChild(req.user!.id, req.params.childId);
      if (!toChildDto(child).photoConsentsComplete) {
        throw new HttpError(
          403,
          'CONSENTS_REQUIRED',
          'Перед загрузкой фотографий подтвердите все согласия на обработку данных ребёнка',
        );
      }
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        throw new HttpError(400, 'NO_FILES', 'Прикрепите хотя бы одну фотографию');
      }
      const existing = await prisma.childPhoto.count({ where: { childId: child.id } });
      if (existing + files.length > CHILD_PHOTOS_MAX) {
        throw new HttpError(
          400,
          'PHOTOS_LIMIT',
          `Максимум ${CHILD_PHOTOS_MAX} фотографий на профиль ребёнка`,
        );
      }

      const created = [];
      for (const file of files) {
        const metadata = await sharp(file.buffer).metadata().catch(() => undefined);
        const storageKey = await saveChildPhoto({
          parentId: req.user!.id,
          childId: child.id,
          buffer: file.buffer,
          mimeType: file.mimetype,
        });
        created.push(
          await prisma.childPhoto.create({
            data: {
              childId: child.id,
              storageKey,
              fileName: file.originalname || 'photo.jpg',
              mimeType: file.mimetype,
              fileSize: file.size,
              width: metadata?.width ?? null,
              height: metadata?.height ?? null,
            },
          }),
        );
      }
      res.status(201).json({ items: created.map(toPhotoDto) });
    } catch (err) {
      next(err);
    }
  },
);

familyRouter.get('/children/:childId/photos/:photoId/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedChild(req.user!.id, req.params.childId);
    const photo = await prisma.childPhoto.findFirst({
      where: { id: req.params.photoId, childId: req.params.childId },
    });
    if (!photo) throw new HttpError(404, 'PHOTO_NOT_FOUND', 'Фотография не найдена');
    const buffer = await readChildPhoto(photo.storageKey).catch(() => {
      throw new HttpError(404, 'PHOTO_FILE_MISSING', 'Файл фотографии недоступен');
    });
    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

familyRouter.delete('/children/:childId/photos/:photoId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedChild(req.user!.id, req.params.childId);
    const photo = await prisma.childPhoto.findFirst({
      where: { id: req.params.photoId, childId: req.params.childId },
    });
    if (!photo) throw new HttpError(404, 'PHOTO_NOT_FOUND', 'Фотография не найдена');
    await prisma.childPhoto.delete({ where: { id: photo.id } });
    await deleteChildPhoto(photo.storageKey);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// === AI-персонаж (A2) ===

function characterRefFileUrl(childId: string, refId: string) {
  return `/api/family/children/${childId}/character/references/${refId}/file`;
}

function toCharacterDto(profile: {
  id: string;
  childId: string;
  status: string;
  progress: number;
  errorMessage: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  references: Array<{
    id: string;
    kind: string;
    width: number | null;
    height: number | null;
    costUsd: number;
    createdAt: Date;
  }>;
}): CharacterProfileDto {
  return {
    id: profile.id,
    childId: profile.childId,
    status: profile.status as CharacterProfileDto['status'],
    progress: profile.progress,
    errorMessage: profile.errorMessage,
    approvedAt: profile.approvedAt ? profile.approvedAt.toISOString() : null,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    references: profile.references.map((ref) => ({
      id: ref.id,
      kind: ref.kind as CharacterRefKind,
      label: CHARACTER_REF_LABELS[ref.kind as CharacterRefKind] ?? ref.kind,
      width: ref.width,
      height: ref.height,
      costUsd: ref.costUsd,
      createdAt: ref.createdAt.toISOString(),
      fileUrl: characterRefFileUrl(profile.childId, ref.id),
    })),
  };
}

const characterInclude = { references: { orderBy: { createdAt: 'asc' as const } } };

async function findOwnedCharacterProfile(parentId: string, childId: string) {
  await findOwnedChild(parentId, childId);
  return prisma.characterProfile.findUnique({
    where: { childId },
    include: characterInclude,
  });
}

async function launchCharacterGeneration(parentId: string, childId: string, kinds?: string[]) {
  const child = await findOwnedChild(parentId, childId);
  if (!toChildDto(child).photoConsentsComplete) {
    throw new HttpError(403, 'CONSENTS_REQUIRED', 'Перед созданием персонажа подтвердите все согласия');
  }
  const photosCount = await prisma.childPhoto.count({ where: { childId } });
  if (photosCount === 0) {
    throw new HttpError(400, 'PHOTOS_REQUIRED', 'Сначала загрузите хотя бы одну фотографию ребёнка');
  }

  const existing = await prisma.characterProfile.findUnique({ where: { childId } });
  if (existing?.status === 'GENERATING') {
    throw new HttpError(409, 'GENERATION_IN_PROGRESS', 'Персонаж уже генерируется — дождитесь завершения');
  }

  const profile = existing
    ? await prisma.characterProfile.update({
        where: { id: existing.id },
        data: { status: 'GENERATING', progress: 0, errorMessage: null, approvedAt: null },
      })
    : await prisma.characterProfile.create({
        data: { childId, status: 'GENERATING', progress: 0 },
      });

  // Контейнер генерации: Project держит FK для AIUsageLog, SSE-события и админ-обзор.
  // inputText хранит id профиля — по нему worker находит свой pending-проект.
  const project = await prisma.project.create({
    data: {
      userId: parentId,
      mode: 'character-profile',
      title: `AI-персонаж: ${child.name}`,
      status: 'PENDING',
      tokensCost: 0,
      inputText: profile.id,
      inputImages: [],
    },
  });

  try {
    await addCharacterProfileJob({ characterProfileId: profile.id, kinds });
  } catch (err) {
    await prisma.characterProfile.update({
      where: { id: profile.id },
      data: { status: 'FAILED', errorMessage: 'Не удалось поставить генерацию в очередь' },
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { status: 'FAILED', errorCode: 'QUEUE_UNAVAILABLE' },
    });
    throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Сервис генерации временно недоступен, попробуйте позже');
  }

  return prisma.characterProfile.findUniqueOrThrow({
    where: { id: profile.id },
    include: characterInclude,
  });
}

familyRouter.get('/children/:childId/character', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await findOwnedCharacterProfile(req.user!.id, req.params.childId);
    res.json({ profile: profile ? toCharacterDto(profile) : null });
  } catch (err) {
    next(err);
  }
});

familyRouter.post('/children/:childId/character/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await launchCharacterGeneration(req.user!.id, req.params.childId);
    res.status(202).json({ profile: toCharacterDto(profile) });
  } catch (err) {
    next(err);
  }
});

familyRouter.post('/children/:childId/character/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await findOwnedCharacterProfile(req.user!.id, req.params.childId);
    if (!profile) throw new HttpError(404, 'CHARACTER_NOT_FOUND', 'Персонаж ещё не создан');
    if (profile.status !== 'READY') {
      throw new HttpError(409, 'CHARACTER_NOT_READY', 'Утвердить можно только готового персонажа');
    }
    const updated = await prisma.characterProfile.update({
      where: { id: profile.id },
      data: { status: 'APPROVED', approvedAt: new Date() },
      include: characterInclude,
    });
    res.json({ profile: toCharacterDto(updated) });
  } catch (err) {
    next(err);
  }
});

familyRouter.get('/children/:childId/character/references/:refId/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await findOwnedCharacterProfile(req.user!.id, req.params.childId);
    const ref = profile?.references.find((item) => item.id === req.params.refId);
    if (!profile || !ref) throw new HttpError(404, 'REFERENCE_NOT_FOUND', 'Референс не найден');
    const stored = await prisma.characterReference.findUniqueOrThrow({ where: { id: ref.id } });
    const buffer = await readCharacterRef(stored.storageKey).catch(() => {
      throw new HttpError(404, 'REFERENCE_FILE_MISSING', 'Файл референса недоступен');
    });
    await prisma.accessLog.create({
      data: {
        actorId: req.user!.id,
        childId: req.params.childId,
        actorRole: req.user!.role,
        action: 'VIEW',
        resourceType: 'CHARACTER_REFERENCE',
        resourceId: stored.id,
      },
    });
    res.setHeader('Content-Type', stored.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

familyRouter.delete('/children/:childId/character/references/:refId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await findOwnedCharacterProfile(req.user!.id, req.params.childId);
    const ref = profile?.references.find((item) => item.id === req.params.refId);
    if (!profile || !ref) throw new HttpError(404, 'REFERENCE_NOT_FOUND', 'Референс не найден');
    if (profile.status === 'GENERATING') {
      throw new HttpError(409, 'GENERATION_IN_PROGRESS', 'Дождитесь завершения генерации');
    }
    const stored = await prisma.characterReference.findUniqueOrThrow({ where: { id: ref.id } });
    await prisma.characterReference.delete({ where: { id: ref.id } });
    await deleteCharacterRefFile(stored.storageKey);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

familyRouter.post('/children/:childId/character/references/:refId/regenerate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await findOwnedCharacterProfile(req.user!.id, req.params.childId);
    const ref = profile?.references.find((item) => item.id === req.params.refId);
    if (!profile || !ref) throw new HttpError(404, 'REFERENCE_NOT_FOUND', 'Референс не найден');
    if (!(CHARACTER_REF_KINDS as readonly string[]).includes(ref.kind)) {
      throw new HttpError(400, 'INVALID_REF_KIND', 'Неизвестный тип референса');
    }
    const updated = await launchCharacterGeneration(req.user!.id, req.params.childId, [ref.kind]);
    res.status(202).json({ profile: toCharacterDto(updated) });
  } catch (err) {
    next(err);
  }
});

// === Прогресс обучения (A3, чтение + запись на курс родителем) ===

familyRouter.get('/children/:childId/progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedChild(req.user!.id, req.params.childId);
    res.json({ progress: await buildChildProgress(req.params.childId) });
  } catch (err) {
    next(err);
  }
});

// История уроков ребёнка для родителя (с кем, когда, тема, статус, есть ли отчёт).
familyRouter.get('/children/:childId/lessons', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedChild(req.user!.id, req.params.childId);
    res.json({ lessons: await buildChildLessonHistory(req.params.childId) });
  } catch (err) {
    next(err);
  }
});

familyRouter.get('/children/:childId/enrollments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedChild(req.user!.id, req.params.childId);
    const progress = await buildChildProgress(req.params.childId);
    res.json({ items: progress.enrollments });
  } catch (err) {
    next(err);
  }
});

familyRouter.post('/children/:childId/enrollments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = enrollChildSchema.parse(req.body);
    await findOwnedChild(req.user!.id, req.params.childId);
    const course = await prisma.course.findFirst({ where: { id: courseId, isActive: true } });
    if (!course) throw new HttpError(404, 'COURSE_NOT_FOUND', 'Курс не найден или недоступен');
    const existing = await prisma.enrollment.findUnique({
      where: { childId_courseId: { childId: req.params.childId, courseId } },
    });
    if (existing) throw new HttpError(409, 'ALREADY_ENROLLED', 'Ребёнок уже записан на этот курс');
    const enrollment = await prisma.enrollment.create({
      data: { childId: req.params.childId, courseId },
    });
    res.status(201).json({ enrollmentId: enrollment.id });
  } catch (err) {
    next(err);
  }
});

familyRouter.delete('/children/:childId/enrollments/:enrollmentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await findOwnedChild(req.user!.id, req.params.childId);
    const enrollment = await prisma.enrollment.findFirst({
      where: { id: req.params.enrollmentId, childId: req.params.childId },
    });
    if (!enrollment) throw new HttpError(404, 'ENROLLMENT_NOT_FOUND', 'Запись на курс не найдена');
    await prisma.enrollment.delete({ where: { id: enrollment.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
