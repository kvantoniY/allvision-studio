import { createApi } from '@reduxjs/toolkit/query/react';
import type { StylePresetKind } from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';
import { publicApi } from './public-api';

export type AdminStylePreset = {
  id: string;
  slug: string;
  kind: StylePresetKind;
  title: string;
  description: string;
  promptText: string;
  thumbnail: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
};

export type StylePresetBody = {
  slug?: string;
  kind?: StylePresetKind;
  title?: string;
  description?: string;
  promptText?: string;
  thumbnail?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export const adminStylePresetsApi = createApi({
  reducerPath: 'adminStylePresetsApi',
  baseQuery: createBaseQueryWithReauth('/api/admin/style-presets'),
  tagTypes: ['AdminStylePreset'],
  endpoints: (build) => ({
    listAdminStylePresets: build.query<{ items: AdminStylePreset[] }, { kind?: StylePresetKind; isActive?: boolean } | void>({
      query: (q) => {
        const params = new URLSearchParams();
        if (q?.kind) params.set('kind', q.kind);
        if (q?.isActive !== undefined) params.set('isActive', String(q.isActive));
        const query = params.toString();
        return { url: `/${query ? `?${query}` : ''}` };
      },
      providesTags: ['AdminStylePreset'],
    }),
    uploadStylePresetThumbnail: build.mutation<{ url: string }, File>({
      query: (file) => {
        const body = new FormData();
        body.append('file', file);
        return { url: '/thumbnail', method: 'POST', body };
      },
    }),
    createAdminStylePreset: build.mutation<{ preset: AdminStylePreset }, Required<Pick<StylePresetBody, 'slug' | 'kind' | 'title' | 'description' | 'promptText'>> & StylePresetBody>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['AdminStylePreset'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['StylePresets']));
      },
    }),
    updateAdminStylePreset: build.mutation<{ preset: AdminStylePreset }, { id: string; body: StylePresetBody }>({
      query: ({ id, body }) => ({ url: `/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['AdminStylePreset'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['StylePresets']));
      },
    }),
    deleteAdminStylePreset: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminStylePreset'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['StylePresets']));
      },
    }),
  }),
});

export const {
  useListAdminStylePresetsQuery,
  useCreateAdminStylePresetMutation,
  useUploadStylePresetThumbnailMutation,
  useUpdateAdminStylePresetMutation,
  useDeleteAdminStylePresetMutation,
} = adminStylePresetsApi;
