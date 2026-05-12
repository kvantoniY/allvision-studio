import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './index';

const PUBLIC_TRENDS_DIR = process.env.PUBLIC_TRENDS_DIR ?? '/opt/allvision-studio/shared/public-trends';
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/opt/allvision-studio/shared/uploads';
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL ?? 'https://allvision-pulse.ru').replace(/\/+$/, '');

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function migrateTrend(index: number) {
  const source = path.join(PUBLIC_TRENDS_DIR, `trend-${index}.mp4`);
  if (!(await fileExists(source))) {
    console.log(`[media-assets] skip missing ${source}`);
    return false;
  }

  const storageKey = `media-assets/trend-video/trend-${index}.mp4`;
  const target = path.join(UPLOADS_DIR, storageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);

  const stat = await fs.stat(target);
  const publicUrl = `${PUBLIC_API_URL}/static/${storageKey}`;
  const existing = await prisma.mediaAsset.findFirst({
    where: {
      OR: [{ storageKey }, { publicUrl }],
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.mediaAsset.update({
      where: { id: existing.id },
      data: {
        kind: 'trend-video',
        title: `Тренд ${index}`,
        storageKey,
        publicUrl,
        fileSize: stat.size,
        mimeType: 'video/mp4',
        sortOrder: index * 10,
        isActive: true,
      },
    });
    console.log(`[media-assets] updated trend-${index}`);
    return true;
  }

  await prisma.mediaAsset.create({
    data: {
      kind: 'trend-video',
      title: `Тренд ${index}`,
      description: 'Migrated production trend video',
      tags: ['trend'],
      storageKey,
      publicUrl,
      fileSize: stat.size,
      mimeType: 'video/mp4',
      sortOrder: index * 10,
      isActive: true,
    },
  });
  console.log(`[media-assets] created trend-${index}`);
  return true;
}

export async function migrateMediaAssets() {
  let migrated = 0;
  for (const index of [1, 2, 3]) {
    if (await migrateTrend(index)) migrated += 1;
  }
  console.log(`[media-assets] done, migrated/updated ${migrated} trend videos`);
  return migrated;
}

if (require.main === module) {
  migrateMediaAssets()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
