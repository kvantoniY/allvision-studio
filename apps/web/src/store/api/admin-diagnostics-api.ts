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

import type { PaymentsHealth, RobokassaProbeResult } from './admin-payments-api';

export const adminDiagnosticsApi = createApi({
  reducerPath: 'adminDiagnosticsApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['AdminDiagnostics', 'PaymentsHealth'],
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
    getPaymentsHealth: build.query<PaymentsHealth, void>({
      query: () => ({ url: '/diagnostics/payments-health' }),
      providesTags: ['PaymentsHealth'],
    }),
    probeRobokassa: build.mutation<RobokassaProbeResult, string>({
      query: (invId) => ({ url: `/diagnostics/robokassa-probe/${encodeURIComponent(invId)}` }),
    }),
  }),
});

export const {
  useGetAdminDiagnosticsStateQuery,
  useRefreshPiAPIBalanceMutation,
  useReloadServicesCatalogMutation,
  useGetPaymentsHealthQuery,
  useProbeRobokassaMutation,
} = adminDiagnosticsApi;
