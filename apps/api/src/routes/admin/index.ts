import { Router } from 'express';
import { adminTrendsRouter } from './trends';
import { adminScenarioTemplatesRouter } from './scenario-templates';
import { adminBlocksRouter } from './blocks';
import { adminServicesRouter } from './services';
import { adminMediaAssetsRouter } from './media-assets';
import { adminUsageRouter } from './usage';
import { adminDiagnosticsRouter } from './diagnostics';

export const adminRouter = Router();

adminRouter.use('/blocks', adminBlocksRouter);
adminRouter.use('/diagnostics', adminDiagnosticsRouter);
adminRouter.use('/', adminUsageRouter);
adminRouter.use('/services', adminServicesRouter);
adminRouter.use('/media-assets', adminMediaAssetsRouter);
adminRouter.use('/trends', adminTrendsRouter);
adminRouter.use('/scenario-templates', adminScenarioTemplatesRouter);
