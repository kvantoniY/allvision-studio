import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __allvisionPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__allvisionPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__allvisionPrisma = prisma;
}

export * from '@prisma/client';
