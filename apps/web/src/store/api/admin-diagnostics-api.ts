import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

export type AdminDiagnosticsState = {
  build: {
    version: string;
    gitSha: string | null;
    nodeEnv: string | null;
  };
  uptime: {
    apiSeconds: number;
    workerSeconds: number | null;
  };
  queues: Array<{
    name: string;
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    completed: number;
    failedLastHour: number;
    available: boolean;
    error?: string;
  }>;
  recentProjects: Array<{
    id: string;
    title: string;
    status: string;
    progress: number;
    selectedTier: string | null;
    createdAt: string;
    completedAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    service: { id: string; slug: string; title: string } | null;
  }>;
  recentErrors: Array<Record<string, unknown>>;
  mediaAssets: Array<Record<string, unknown>>;
  env: Record<string, string | null>;
  piapiBalance: {
    balanceUsd: number | null;
    lastChecked: string | null;
    lowBalance: boolean;
    errorCode?: string;
  };
};

export const adminDiagnosticsApi = createApi({
  reducerPath: 'adminDiagnosticsApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['AdminDiagnostics'],
  endpoints: (build) => ({
    getAdminDiagnosticsState: build.query<AdminDiagnosticsState, void>({
      query: () => ({ url: '/diagnostics/state' }),
      providesTags: ['AdminDiagnostics'],
    }),
    refreshPiAPIBalance: build.mutation<AdminDiagnosticsState['piapiBalance'], void>({
      query: () => ({ url: '/diagnostics/refresh-balance', method: 'POST' }),
      invalidatesTags: ['AdminDiagnostics'],
    }),
    reloadServicesCatalog: build.mutation<{ ok: true; reloadedAt: string; note: string }, void>({
      query: () => ({ url: '/diagnostics/reload-services-catalog', method: 'POST' }),
      invalidatesTags: ['AdminDiagnostics'],
    }),
  }),
});

export const {
  useGetAdminDiagnosticsStateQuery,
  useRefreshPiAPIBalanceMutation,
  useReloadServicesCatalogMutation,
} = adminDiagnosticsApi;
