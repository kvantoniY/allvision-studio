import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

export type AdminProjectUsageLog = {
  id: string;
  createdAt: string;
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
};

export type AdminProject = {
  id: string;
  title: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  tokensCost: number;
  userPriceCoins: number;
  costUsd: number;
  errorCode: string | null;
  errorMessage: string | null;
  selectedTier: string | null;
  createdAt: string;
  completedAt: string | null;
  user: { id: string; email: string };
  service: { id: string; slug: string; title: string; priceCoinsStandard: number | null; priceCoinsPro: number | null; priceTokens: number } | null;
  aiUsageLogs?: AdminProjectUsageLog[];
  pipelineSnapshot?: unknown;
  userInputs?: unknown;
  stepProgress?: unknown;
  inputText?: string | null;
  inputImages?: string[];
  resultImage?: string | null;
  resultVideo?: string | null;
};

export type AdminProjectsQuery = {
  page?: number;
  limit?: number;
  status?: AdminProject['status'];
  serviceSlug?: string;
  serviceId?: string;
  dateFrom?: string;
  dateTo?: string;
  user?: string;
};

export type AdminProjectsResponse = {
  items: AdminProject[];
  total: number;
  page: number;
  limit: number;
  services: Array<{ id: string; slug: string; title: string }>;
};

export const adminProjectsApi = createApi({
  reducerPath: 'adminProjectsApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['AdminProject'],
  endpoints: (build) => ({
    listAdminProjects: build.query<AdminProjectsResponse, AdminProjectsQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 50));
        if (q?.status) params.set('status', q.status);
        if (q?.serviceSlug) params.set('serviceSlug', q.serviceSlug);
        if (q?.serviceId) params.set('serviceId', q.serviceId);
        if (q?.dateFrom) params.set('dateFrom', q.dateFrom);
        if (q?.dateTo) params.set('dateTo', q.dateTo);
        if (q?.user) params.set('user', q.user);
        return { url: `/projects?${params.toString()}` };
      },
      providesTags: (result) => [
        'AdminProject',
        ...(result?.items.map((project) => ({ type: 'AdminProject' as const, id: project.id })) ?? []),
      ],
    }),
    getAdminProject: build.query<{ project: AdminProject }, string>({
      query: (id) => ({ url: `/projects/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'AdminProject', id }],
    }),
    deleteAdminProject: build.mutation<{ ok: true; projectsDeleted: number; filesDeleted: number }, string>({
      query: (id) => ({ url: `/projects/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => ['AdminProject', { type: 'AdminProject', id }],
    }),
  }),
});

export const {
  useListAdminProjectsQuery,
  useGetAdminProjectQuery,
  useDeleteAdminProjectMutation,
} = adminProjectsApi;
