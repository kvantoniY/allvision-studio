import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { ScenarioTemplate } from '@allvision/shared';
import { publicApi } from './public-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

export type AdminScenarioTemplatesQuery = {
  page?: number;
  limit?: number;
  category?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  search?: string;
};

export type AdminScenarioTemplatesResponse = {
  items: ScenarioTemplate[];
  total: number;
  page: number;
  limit: number;
};

export type UpdateAdminScenarioTemplateArg = {
  id: string;
  body: FormData;
};

export type ReorderAdminScenarioTemplateArg = {
  id: string;
  direction: 'up' | 'down';
};

export const adminScenarioTemplatesApi = createApi({
  reducerPath: 'adminScenarioTemplatesApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_URL}/api/admin/scenario-templates`,
    credentials: 'include',
  }),
  tagTypes: ['AdminScenarioTemplate'],
  endpoints: (build) => ({
    listAdminScenarioTemplates: build.query<AdminScenarioTemplatesResponse, AdminScenarioTemplatesQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 50));
        if (q?.category) params.set('category', q.category);
        if (q?.isActive !== undefined) params.set('isActive', String(q.isActive));
        if (q?.isFeatured !== undefined) params.set('isFeatured', String(q.isFeatured));
        if (q?.search) params.set('search', q.search);
        return { url: `/?${params.toString()}` };
      },
      providesTags: (result) => [
        'AdminScenarioTemplate',
        ...(result?.items.map((template) => ({ type: 'AdminScenarioTemplate' as const, id: template.id })) ?? []),
      ],
    }),
    getAdminScenarioTemplate: build.query<{ template: ScenarioTemplate }, string>({
      query: (id) => ({ url: `/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'AdminScenarioTemplate', id }],
    }),
    createAdminScenarioTemplate: build.mutation<{ template: ScenarioTemplate }, FormData>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['AdminScenarioTemplate'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        invalidateScenarioTemplateSideEffects(dispatch);
      },
    }),
    updateAdminScenarioTemplate: build.mutation<{ template: ScenarioTemplate }, UpdateAdminScenarioTemplateArg>({
      query: ({ id, body }) => ({ url: `/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => ['AdminScenarioTemplate', { type: 'AdminScenarioTemplate', id }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        invalidateScenarioTemplateSideEffects(dispatch);
      },
    }),
    deleteAdminScenarioTemplate: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminScenarioTemplate'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        invalidateScenarioTemplateSideEffects(dispatch);
      },
    }),
    reorderAdminScenarioTemplate: build.mutation<{ ok: true; moved: boolean }, ReorderAdminScenarioTemplateArg>({
      query: ({ id, direction }) => ({ url: `/${id}/reorder`, method: 'POST', body: { direction } }),
      invalidatesTags: ['AdminScenarioTemplate'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        invalidateScenarioTemplateSideEffects(dispatch);
      },
    }),
  }),
});

type InvalidateAction =
  | ReturnType<typeof adminScenarioTemplatesApi.util.invalidateTags>
  | ReturnType<typeof publicApi.util.invalidateTags>;

export function invalidateScenarioTemplateSideEffects(dispatch: (action: InvalidateAction) => unknown) {
  dispatch(publicApi.util.invalidateTags(['ScenarioTemplates']));
}

export const {
  useListAdminScenarioTemplatesQuery,
  useGetAdminScenarioTemplateQuery,
  useCreateAdminScenarioTemplateMutation,
  useUpdateAdminScenarioTemplateMutation,
  useDeleteAdminScenarioTemplateMutation,
  useReorderAdminScenarioTemplateMutation,
} = adminScenarioTemplatesApi;
