import 'dotenv/config';
import { prisma } from './index';
import { runSeed } from './seed';

process.env.ADMIN_INITIAL_EMAIL ||= 'admin@allvision.studio';
process.env.ADMIN_INITIAL_PASSWORD ||= 'admin123';

runSeed({ destructive: true, includeDevUser: true, includeDevCatalog: true })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
