import { Router, type NextFunction, type Request, type Response } from 'express';
import { Prisma, prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { HttpError } from '../../utils/http-error';
import * as queues from '../../queues';
import { logger } from '../../utils/logger';

export const adminServicesRouter = Router();

const testRunSchema = z.object({
  userInputs: z.record(z.unknown()).optional(),
  selectedTier: z.enum(['standard', 'pro']).optional(),
});

adminServicesRouter.use(requireAuth, requireAdmin);

adminServicesRouter.post('/:id/test-run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new HttpError(401, 'UNAUTHORIZED', 'Unauthorized');

    const body = testRunSchema.parse(req.body ?? {});
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        title: true,
        pipelineConfig: true,
      },
    });
    if (!service) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Service not found');
    if (!Array.isArray(service.pipelineConfig)) {
      throw new HttpError(400, 'PIPELINE_CONFIG_MISSING', 'Service pipelineConfig is empty');
    }

    const selectedTier = body.selectedTier ?? 'standard';
    const userInputs = body.userInputs ?? {
      photo: 'mock://admin-test/photo.jpg',
      name: 'Test User',
      prompt: 'Mock pipeline test run',
    };

    const project = await prisma.project.create({
      data: {
        userId: req.user.id,
        serviceId: service.id,
        title: `Test run: ${service.title}`,
        status: 'PENDING',
        progress: 0,
        inputImages: typeof userInputs.photo === 'string' ? [userInputs.photo] : [],
        inputText: 'Admin pipeline test run',
        tokensCost: 0,
        pipelineSnapshot: service.pipelineConfig as Prisma.InputJsonValue,
        selectedTier,
        userInputs: userInputs as Prisma.InputJsonValue,
        stepProgress: [],
      },
      select: { id: true },
    });

    try {
      await queues.addServicePipelineJob({ projectId: project.id, userId: req.user.id });
    } catch (err) {
      logger.error(`Failed to enqueue service pipeline test-run ${project.id}`, err);
      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'FAILED', errorMessage: 'Queue unavailable' },
      });
      throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Queue unavailable');
    }

    res.status(202).json({ generationId: project.id, status: 'started' });
  } catch (err) {
    next(err);
  }
});
