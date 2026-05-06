import { Router } from 'express';
import { adminTrendsRouter } from './trends';
import { adminScenarioTemplatesRouter } from './scenario-templates';
import { adminBlocksRouter } from './blocks';
import { adminServicesRouter } from './services';

export const adminRouter = Router();

adminRouter.use('/blocks', adminBlocksRouter);
adminRouter.use('/services', adminServicesRouter);
adminRouter.use('/trends', adminTrendsRouter);
adminRouter.use('/scenario-templates', adminScenarioTemplatesRouter);
