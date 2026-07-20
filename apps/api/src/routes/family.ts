import { Router, type NextFunction, type Request, type Response } from 'express';
import sharp from 'sharp';
import { prisma } from '@allvision/database';
import {
  acceptConsentsSchema,
  CHILD_PHOTOS_MAX,
  CONSENT_CURRENT_VERSION,
  CONSENT_TYPES,
  createChildProfileSchema,
  hasAllPhotoConsents,
  updateChildProfileSchema,
  type ChildPhotoDto,
  type ChildProfileDto,
} from '@allvision/shared';
import { requireAuth } from '../middleware/auth';
import { requireParent } from '../middleware/require-role';
import { uploadChildPhotos } from '../middleware/upload';
import { HttpError } from '../utils/http-error';
import {
  deleteChildPhoto,
  deleteChildPhotoDir,
  readChildPhoto,
  saveChildPhoto,
} from '../services/child-photo-storage';

export const familyRouter = Router();

familyRouter.use(requireAuth, requireParent);

const childInclude = {
  consents: true,
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
    acceptedAt: consent.acceptedAt.toISOString(),
    revokedAt: consent.revokedAt ? consent.revokedAt.toISOString() : null,
  }));
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
    photoConsentsComplete: hasAllPhotoConsents(consents),
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
    await findOwnedChild(req.user!.id, req.params.childId);
    // Каскадная очистка: БД (onDelete: Cascade) + файлы закрытого хранилища.
    await prisma.childProfile.delete({ where: { id: req.params.childId } });
    await deleteChildPhotoDir(req.user!.id, req.params.childId);
    res.json({ ok: true });
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
        },
        update: { acceptedAt: new Date(), revokedAt: null, version: CONSENT_CURRENT_VERSION },
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
