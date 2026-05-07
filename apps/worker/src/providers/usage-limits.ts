import crypto from 'node:crypto';
import { Prisma, prisma } from '@allvision/database';
import { ProviderError } from './provider-errors';

export interface AIUsageLogInput {
  projectId?: string;
  userId?: string;
  blockSlug: string;
  provider: string;
  model: string;
  taskId?: string;
  status: 'success' | 'failed' | 'timeout';
  costUsd: number;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export async function getPiAPISpendLast24h(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT COALESCE(SUM("costUsd"), 0)::float AS total
    FROM "AIUsageLog"
    WHERE "provider" = 'piapi'
      AND "createdAt" > NOW() - INTERVAL '24 hours'
  `;
  return Number(rows[0]?.total ?? 0);
}

export async function assertPiAPIDailyCap(nextCostUsd: number, capUsd: number) {
  const used = await getPiAPISpendLast24h();
  if (used + nextCostUsd >= capUsd) {
    throw new ProviderError('DAILY_CAP_EXCEEDED', 'PiAPI daily cap exceeded');
  }
}

export async function createAIUsageLog(data: AIUsageLogInput) {
  await prisma.$executeRaw`
    INSERT INTO "AIUsageLog" (
      "id", "projectId", "userId", "blockSlug", "provider", "model", "taskId",
      "status", "costUsd", "durationMs", "errorCode", "errorMessage"
    )
    VALUES (
      ${crypto.randomUUID()}, ${data.projectId ?? null}, ${data.userId ?? null},
      ${data.blockSlug}, ${data.provider}, ${data.model}, ${data.taskId ?? null},
      ${data.status}, ${data.costUsd}, ${data.durationMs},
      ${data.errorCode ?? null}, ${data.errorMessage ?? null}
    )
  `;
}

export async function deleteAIUsageLogsByUserIds(userIds: string[]) {
  if (userIds.length === 0) return;
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "AIUsageLog"
    WHERE "userId" IN (${Prisma.join(userIds)})
  `);
}

export async function deleteAIUsageLogsByUserIdPrefix(prefix: string) {
  await prisma.$executeRaw`
    DELETE FROM "AIUsageLog"
    WHERE "userId" LIKE ${`${prefix}%`}
  `;
}

export async function findLatestAIUsageLog(projectId: string) {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    costUsd: number;
    taskId: string | null;
  }>>`
    SELECT "id", "costUsd", "taskId"
    FROM "AIUsageLog"
    WHERE "projectId" = ${projectId}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}
