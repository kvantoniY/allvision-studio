import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth';
import { accountRouter } from './account';
import { paymentsRouter } from './payments';
import { generationsRouter } from './generations';
import { adminRouter } from './admin';

export const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/account', accountRouter);
router.use('/payments', paymentsRouter);
router.use('/generations', generationsRouter);
router.use('/admin', adminRouter);
