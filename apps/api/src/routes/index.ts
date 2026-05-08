import { Router } from 'express';
import { healthRouter, readinessHandler } from './health';
import { authRouter } from './auth';
import { publicRouter } from './public';
import { servicesRouter } from './services';
import { accountRouter } from './account';
import { paymentsRouter } from './payments';
import { projectsRouter } from './projects';
import { charactersRouter } from './characters';
import { scenesRouter } from './scenes';
import { episodesRouter } from './episodes';
import { adminRouter } from './admin';

export const router = Router();

router.use('/health', healthRouter);
router.get('/ready', readinessHandler);
router.use('/auth', authRouter);
router.use('/public', publicRouter);
router.use('/services', servicesRouter);
router.use('/account', accountRouter);
router.use('/payments', paymentsRouter);
router.use('/projects', projectsRouter);
router.use('/characters', charactersRouter);
router.use('/scenes', scenesRouter);
router.use('/episodes', episodesRouter);
router.use('/admin', adminRouter);
