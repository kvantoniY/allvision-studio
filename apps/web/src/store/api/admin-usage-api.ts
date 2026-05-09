import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

export type AdminUsageQuery = {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  provider?: string;
  blockSlug?: string;
  model?: string;
  status?: string;
  userId?: string;
  projectId?: string;
};

export type AdminUsageLog = {
  id: string;
  createdAt: string;
  projectId: string | null;
  userId: string | null;
  blockSlug: string;
  provider: string;
  model: string;
  taskId: string | null;
  status: string;
  costUsd: number;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  project?: {
    id: string;
    title: string;
    service: { id: string; slug: string; title: string } | null;
  } | null;
};

export type AdminUsageResponse = {
  logs: AdminUsageLog[];
  total: number;
  page: number;
  limit: number;
  summary: {
    totalRequests: number;
    successCount: number;
    failedCount: number;
    timeoutCount: number;
    totalCostUsd: number;
    avgDurationMs: number;
  };
  byDay: Array<{ date: string; totalCostUsd: number; requestCount: number }>;
  byModel: Array<{ model: string; requestCount: number; totalCostUsd: number; avgDurationMs: number }>;
  byBlock: Array<{ blockSlug: string; requestCount: number; totalCostUsd: number; successRate: number }>;
};

export type PiAPIAccountResponse = {
  balanceUsd: number;
  lastChecked: string;
  lowBalance: boolean;
  raw: unknown;
};

export const adminUsageApi = createApi({
  reducerPath: 'adminUsageApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_URL}/api/admin`,
    credentials: 'include',
  }),
  tagTypes: ['AdminUsage', 'PiAPIAccount'],
  endpoints: (build) => ({
    getAdminUsage: build.query<AdminUsageResponse, AdminUsageQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 50));
        for (const key of ['dateFrom', 'dateTo', 'provider', 'blockSlug', 'model', 'status', 'userId', 'projectId'] as const) {
          if (q?.[key]) params.set(key, q[key]!);
        }
        return { url: `/usage?${params.toString()}` };
      },
      providesTags: ['AdminUsage'],
    }),
    getPiAPIAccount: build.query<PiAPIAccountResponse, { refresh?: boolean } | void>({
      query: (q) => ({ url: `/piapi/account${q?.refresh ? '?refresh=true' : ''}` }),
      providesTags: ['PiAPIAccount'],
    }),
  }),
});

export const {
  useGetAdminUsageQuery,
  useGetPiAPIAccountQuery,
} = adminUsageApi;
