import '../src/config/env';
import sharp from 'sharp';
import { prisma, ProcessingType, ProjectStatus, ServiceCategory } from '@allvision/database';
import { getAIProvider, getStorageProvider, initialiseWorkerProviders } from '../src/providers';
import { findLatestAIUsageLog } from '../src/providers/usage-limits';

async function main() {
  if (!process.env.RUN_PIAPI_SMOKE) {
    console.log('PiAPI smoke skipped: set RUN_PIAPI_SMOKE=1 to run a real billable request.');
    return;
  }

  await initialiseWorkerProviders();
  const storage = getStorageProvider();
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      email: `piapi-smoke-${stamp}@example.com`,
      passwordHash: 'smoke',
      tokenBalance: 0,
    },
  });
  const service = await prisma.service.create({
    data: {
      slug: `piapi-smoke-${stamp}`,
      title: 'PiAPI smoke',
      shortDesc: 'PiAPI smoke',
      description: 'PiAPI smoke',
      category: ServiceCategory.TRENDS_MEMES,
      priceTokens: 0,
      costUsd: 0,
      galleryImages: [],
      isActive: false,
      processingType: ProcessingType.AUTO,
    },
  });
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      serviceId: service.id,
      title: 'PiAPI smoke',
      status: ProjectStatus.PROCESSING,
      inputImages: [],
      tokensCost: 0,
    },
  });

  const buffer = await sharp({
    create: { width: 512, height: 512, channels: 3, background: '#8fb6ff' },
  }).jpeg({ quality: 90 }).toBuffer();
  const uploaded = await storage.upload({
    key: `user-inputs/${user.id}/${project.id}/smoke.jpg`,
    body: buffer,
    contentType: 'image/jpeg',
  });

  const provider = getAIProvider('image-to-video');
  const result = await provider.imageToVideo({
    imageUrl: uploaded.url,
    prompt: 'gentle camera push in, soft light',
    durationSec: 5,
    model: 'kling-std',
    context: {
      projectId: project.id,
      userId: user.id,
      blockSlug: 'image-to-video',
      stepId: 'step_1',
      reportProgress: async (progress) => console.log(`progress ${progress}%`),
    },
  });

  const usage = await findLatestAIUsageLog(project.id);
  console.log('PiAPI smoke result:', result.outputUrl);
  console.log('AIUsageLog:', usage ? { id: usage.id, costUsd: usage.costUsd, taskId: usage.taskId } : null);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
