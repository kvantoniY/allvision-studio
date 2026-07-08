import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

export type MonitoringHealth = 'ok' | 'warn' | 'down' | 'unknown';

export type MonitoringIndicator = {
  id: string;
  label: string;
  category: string;
  note: string;
  url: string;
  trackDate: boolean;
  expiresAt: string | null;
  warnDays: number | null;
  trackBalance: boolean;
  balance: number | null;
  balanceUnit: string;
  warnBalance: number | null;
  manualStatus: 'auto' | 'ok' | 'warn' | 'down';
  updatedAt?: string;
  // computed server-side
  daysLeft?: number | null;
  health?: MonitoringHealth;
};

export type MonitoringUsageLog = {
  model: string | null;
  blockSlug: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  taskId: string | null;
  costUsd: number | null;
  createdAt: string;
};

export type MonitoringErrorItem = {
  id: string;
  title: string;
  mode: string;
  createdAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  selectedTier: string | null;
  tokensCost: number;
  userInputs: unknown;
  inputText: string | null;
  inputImages: string[];
  service: { slug: string; title: string } | null;
  user: { id: string; email: string } | null;
  aiUsageLogs: MonitoringUsageLog[];
};

export type MonitoringState = {
  indicators: MonitoringIndicator[];
  auto: {
    domain: string;
    ssl: { available: boolean; host?: string; validTo?: string; daysLeft?: number | null; issuer?: string | null; health?: MonitoringHealth; error?: string };
    whois: { available: boolean; domain?: string; validTo?: string; daysLeft?: number | null; health?: MonitoringHealth; error?: string };
    captcha: { enabled: boolean; configured: boolean; health: MonitoringHealth; note?: string; checkedAt?: string };
    falBalance: { available: boolean; balanceUsd?: number; currency?: string; health: MonitoringHealth; error?: string; checkedAt?: string };
  };
  errors: {
    since: string;
    failedCount: number;
    completedCount: number;
    byCode: Array<{ code: string; count: number }>;
    items: MonitoringErrorItem[];
  };
  generatedAt: string;
};

export const adminMonitoringApi = createApi({
  reducerPath: 'adminMonitoringApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['Monitoring'],
  endpoints: (build) => ({
    getMonitoring: build.query<MonitoringState, void>({
      query: () => ({ url: '/monitoring' }),
      providesTags: ['Monitoring'],
    }),
    updateMonitoringIndicators: build.mutation<{ indicators: MonitoringIndicator[] }, { indicators: MonitoringIndicator[] }>({
      query: (body) => ({ url: '/monitoring/indicators', method: 'PUT', body }),
      invalidatesTags: ['Monitoring'],
    }),
  }),
});

export const { useGetMonitoringQuery, useUpdateMonitoringIndicatorsMutation } = adminMonitoringApi;
