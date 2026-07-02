import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

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
  recoverableOutputUrl: string | null;
  requestPayload: unknown | null;
  responsePayload: unknown | null;
  project?: {
    id: string;
    title: string;
    status: string;
    progress: number;
    inputImages: string[];
    inputText: string | null;
    selectedTier: string | null;
    userInputs: unknown | null;
    pipelineSnapshot: unknown | null;
    stepProgress: unknown | null;
    aiProviderLogs: unknown | null;
    resultImage: string | null;
    resultVideo: string | null;
    resultThumbnail: string | null;
    resultAssets: unknown | null;
    errorCode: string | null;
    errorMessage: string | null;
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
    statusCounts: Record<string, number>;
  };
  byDay: Array<{ date: string; totalCostUsd: number; requestCount: number }>;
  byModel: Array<{ model: string; requestCount: number; totalCostUsd: number; avgDurationMs: number }>;
  byBlock: Array<{ blockSlug: string; requestCount: number; totalCostUsd: number; successRate: number }>;
  timeoutPending: Array<{
    id: string;
    createdAt: string;
    projectId: string | null;
    blockSlug: string;
    model: string;
    taskId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
};

export type FalAccountResponse = {
  balanceUsd: number;
  currency?: string;
  username?: string;
  lastChecked: string;
  lowBalance: boolean;
};

export type AdminAnalyticsOverview = {
  range: { from: string; to: string };
  usdToRub: number;
  users: { total: number; new: number };
  payments: { count: number; amountRub: number; coinsAdded: number };
  generations: { total: number; completed: number; failed: number };
  finance: {
    revenueCoins: number;
    providerCostUsd: number;
    providerCostRub: number;
    providerRequests: number;
    netProfitRub: number;
  };
  topServices: Array<{
    serviceId: string;
    title: string;
    slug: string;
    category: string;
    runs: number;
    completed: number;
    revenueCoins: number;
  }>;
};

export const adminUsageApi = createApi({
  reducerPath: 'adminUsageApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['AdminUsage', 'FalAccount'],
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
    getFalAccount: build.query<FalAccountResponse, { refresh?: boolean } | void>({
      query: (q) => ({ url: `/fal/account${q?.refresh ? '?refresh=true' : ''}` }),
      providesTags: ['FalAccount'],
    }),
    getAdminAnalyticsOverview: build.query<AdminAnalyticsOverview, { dateFrom?: string; dateTo?: string } | void>({
      query: (q) => {
        const params = new URLSearchParams();
        if (q?.dateFrom) params.set('dateFrom', q.dateFrom);
        if (q?.dateTo) params.set('dateTo', q.dateTo);
        const qs = params.toString();
        return { url: `/overview${qs ? `?${qs}` : ''}` };
      },
      providesTags: ['AdminUsage'],
    }),
    getFalModels: build.query<FalModelsResponse, void>({
      query: () => ({ url: '/fal/models' }),
    }),
    getFalPricing: build.query<FalPricingResponse, { slug?: string; endpoint?: string; duration?: number; numImages?: number }>({
      query: (q) => {
        const params = new URLSearchParams();
        if (q.slug) params.set('slug', q.slug);
        if (q.endpoint) params.set('endpoint', q.endpoint);
        if (q.duration) params.set('duration', String(q.duration));
        if (q.numImages) params.set('numImages', String(q.numImages));
        return { url: `/fal/pricing?${params.toString()}` };
      },
    }),
  }),
});

export type FalModelsResponse = {
  count: number;
  models: Array<{
    slug: string;
    endpoint: string;
    title: string;
    category: string;
    description?: string;
    unitPrice: number | null;
    unit: string | null;
  }>;
};

export type FalPricingResponse = {
  available: boolean;
  endpoint?: string;
  unitPrice?: number;
  unit?: string;
  units?: number;
  costUsd?: number;
  reason?: string;
};

export const {
  useGetAdminUsageQuery,
  useGetFalAccountQuery,
  useGetAdminAnalyticsOverviewQuery,
  useGetFalPricingQuery,
  useGetFalModelsQuery,
} = adminUsageApi;
