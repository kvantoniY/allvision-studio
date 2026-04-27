import { Router } from 'express';
import { adminTrendsRouter } from './trends';

export const adminRouter = Router();

adminRouter.use('/trends', adminTrendsRouter);
