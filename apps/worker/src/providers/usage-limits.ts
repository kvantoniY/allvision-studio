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
  status: 'success' | 'failed' | 'timeout' | 'timeout_charged' | 'timeout_pending';
  costUsd: number;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
  recoverableOutputUrl?: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
}

const MAX_LOG_DEPTH = 8;
const MAX_LOG_ARRAY_ITEMS = 80;
const MAX_LOG_STRING_LENGTH = 12000;
const REDACTED_KEY_PATTERN = /(api[-_]?key|authorization|bearer|password|secret|token|cookie|set-cookie)/i;

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
  await prisma.aIUsageLog.create({
    data: {
      id: crypto.randomUUID(),
      projectId: data.projectId ?? null,
      userId: data.userId ?? null,
      blockSlug: data.blockSlug,
      provider: data.provider,
      model: data.model,
      taskId: data.taskId ?? null,
      status: data.status,
      costUsd: data.costUsd,
      durationMs: data.durationMs,
      errorCode: data.errorCode ?? null,
      errorMessage: data.errorMessage ?? null,
      recoverableOutputUrl: data.recoverableOutputUrl ?? null,
      ...(data.requestPayload === undefined ? {} : { requestPayload: toPrismaJson(data.requestPayload) }),
      ...(data.responsePayload === undefined ? {} : { responsePayload: toPrismaJson(data.responsePayload) }),
    },
  });
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

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return sanitizeForLogJson(value) as Prisma.InputJsonValue;
}

function sanitizeForLogJson(value: unknown, depth = 0): unknown {
  if (depth > MAX_LOG_DEPTH) return '[truncated:max-depth]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) {
    return { type: 'Buffer', byteLength: value.byteLength };
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value instanceof ProviderError ? { code: value.code, status: value.status } : {}),
    };
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_LOG_ARRAY_ITEMS).map((item) => sanitizeForLogJson(item, depth + 1));
    if (value.length > MAX_LOG_ARRAY_ITEMS) {
      items.push(`[truncated:${value.length - MAX_LOG_ARRAY_ITEMS}-items]`);
    }
    return items;
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        REDACTED_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeForLogJson(item, depth + 1),
      ]),
    );
  }
  return String(value);
}

function sanitizeString(value: string) {
  if (value.startsWith('data:')) return `[redacted:data-url:${value.length}-chars]`;
  if (value.length <= MAX_LOG_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_STRING_LENGTH)}...[truncated:${value.length - MAX_LOG_STRING_LENGTH}-chars]`;
}
