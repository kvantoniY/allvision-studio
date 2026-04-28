import { Router } from 'express';
import { adminTrendsRouter } from './trends';
import { adminScenarioTemplatesRouter } from './scenario-templates';

export const adminRouter = Router();

adminRouter.use('/trends', adminTrendsRouter);
adminRouter.use('/scenario-templates', adminScenarioTemplatesRouter);
