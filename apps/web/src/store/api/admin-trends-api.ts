import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { publicApi } from './public-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type AdminTrend = {
  id: string;
  title: string;
  description: string | null;
  previewVideo: string;
  referenceImg: string | null;
  referenceVideo: string | null;
  prompt: string;
  negativePrompt: string | null;
  aiProvider: string;
  aiModel: string;
  aiConfig: unknown;
  tags: string[];
  priceTokens: number | null;
  isActive: boolean;
  sortOrder: number;
  viewsCount: number;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
  serviceId: string;
  service: {
    id: string;
    slug: string;
    title: string;
    priceTokens: number;
  };
};

export type AdminTrendsQuery = {
  page?: number;
  limit?: number;
  serviceSlug?: string;
  isActive?: boolean;
  search?: string;
};

export type AdminTrendsResponse = {
  items: AdminTrend[];
  total: number;
  page: number;
  limit: number;
};

type UpdateAdminTrendArg = {
  id: string;
  body: FormData;
};

type ReorderAdminTrendArg = {
  id: string;
  direction: 'up' | 'down';
};

export const adminTrendsApi = createApi({
  reducerPath: 'adminTrendsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_URL}/api/admin/trends`,
    credentials: 'include',
  }),
  tagTypes: ['AdminTrend'],
  endpoints: (build) => ({
    listAdminTrends: build.query<AdminTrendsResponse, AdminTrendsQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 50));
        if (q?.serviceSlug) params.set('serviceSlug', q.serviceSlug);
        if (q?.isActive !== undefined) params.set('isActive', String(q.isActive));
        if (q?.search) params.set('search', q.search);
        return { url: `/?${params.toString()}` };
      },
      providesTags: (result) => [
        'AdminTrend',
        ...(result?.items.map((trend) => ({ type: 'AdminTrend' as const, id: trend.id })) ?? []),
      ],
    }),
    getAdminTrend: build.query<{ trend: AdminTrend }, string>({
      query: (id) => ({ url: `/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'AdminTrend', id }],
    }),
    createAdminTrend: build.mutation<{ trend: AdminTrend }, FormData>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['AdminTrend'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        invalidateAdminTrendSideEffects(dispatch);
      },
    }),
    updateAdminTrend: build.mutation<{ trend: AdminTrend }, UpdateAdminTrendArg>({
      query: ({ id, body }) => ({ url: `/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => ['AdminTrend', { type: 'AdminTrend', id }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        invalidateAdminTrendSideEffects(dispatch);
      },
    }),
    deleteAdminTrend: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminTrend'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        invalidateAdminTrendSideEffects(dispatch);
      },
    }),
    reorderAdminTrend: build.mutation<{ ok: true; moved: boolean }, ReorderAdminTrendArg>({
      query: ({ id, direction }) => ({ url: `/${id}/reorder`, method: 'POST', body: { direction } }),
      invalidatesTags: ['AdminTrend'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        invalidateAdminTrendSideEffects(dispatch);
      },
    }),
  }),
});

type InvalidateAction =
  | ReturnType<typeof adminTrendsApi.util.invalidateTags>
  | ReturnType<typeof publicApi.util.invalidateTags>;

export function invalidateAdminTrendSideEffects(dispatch: (action: InvalidateAction) => unknown) {
  dispatch(publicApi.util.invalidateTags(['Trends']));
}

export const {
  useListAdminTrendsQuery,
  useGetAdminTrendQuery,
  useCreateAdminTrendMutation,
  useUpdateAdminTrendMutation,
  useDeleteAdminTrendMutation,
  useReorderAdminTrendMutation,
} = adminTrendsApi;
