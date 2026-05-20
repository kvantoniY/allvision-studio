import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '@allvision/database';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/require-admin';
import { readModelPriceOverrides, writeModelPriceOverrides } from '../../services/model-pricing';

export const adminSettingsRouter = Router();

adminSettingsRouter.use(requireAuth, requireAdmin);

const USD_TO_RUB_KEY = 'USD_TO_RUB';
const DEFAULT_USD_TO_RUB = 80;

const updateSettingsSchema = z.object({
  usdToRub: z.coerce.number().positive().max(1000).optional(),
  modelPriceOverrides: z.record(z.coerce.number().int().min(0)).optional(),
});

adminSettingsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ settings: await readSettings() });
  } catch (err) {
    next(err);
  }
});

adminSettingsRouter.patch('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateSettingsSchema.parse(req.body);
    if (body.usdToRub !== undefined) {
      await prisma.setting.upsert({
        where: { key: USD_TO_RUB_KEY },
        update: { value: String(body.usdToRub) },
        create: { key: USD_TO_RUB_KEY, value: String(body.usdToRub) },
      });
    }
    if (body.modelPriceOverrides !== undefined) {
      await writeModelPriceOverrides(body.modelPriceOverrides);
    }
    res.json({ settings: await readSettings() });
  } catch (err) {
    next(err);
  }
});

async function readUsdToRub() {
  const row = await prisma.setting.findUnique({ where: { key: USD_TO_RUB_KEY } });
  const value = Number(row?.value ?? process.env.PRICING_USD_TO_RUB ?? DEFAULT_USD_TO_RUB);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_USD_TO_RUB;
}

async function readSettings() {
  const [usdToRub, modelPriceOverrides] = await Promise.all([
    readUsdToRub(),
    readModelPriceOverrides(),
  ]);
  return { usdToRub, modelPriceOverrides };
}
