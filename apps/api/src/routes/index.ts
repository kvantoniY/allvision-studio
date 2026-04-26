import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth';
import { publicRouter } from './public';
import { accountRouter } from './account';

export const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/public', publicRouter);
router.use('/account', accountRouter);
