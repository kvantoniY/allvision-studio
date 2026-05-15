import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import { publicApi } from './public-api';

export type AdminMediaAsset = {
  id: string;
  createdAt: string;
  updatedAt: string;
  kind: string;
  title: string;
  description: string | null;
  tags: string[];
  storageKey: string;
  publicUrl: string;
  thumbnailKey: string | null;
  ownerUserId: string | null;
  parentAssetId: string | null;
  owner?: { id: string; email: string } | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  frameCount: number | null;
  fileSize: number;
  mimeType: string;
  isActive: boolean;
  sortOrder: number;
};

export type AdminMediaAssetsQuery = {
  page?: number;
  limit?: number;
  kind?: string;
  isActive?: boolean;
  search?: string;
};

export type AdminMediaAssetsResponse = {
  items: AdminMediaAsset[];
  total: number;
  page: number;
  limit: number;
};

export const adminMediaAssetsApi = createApi({
  reducerPath: 'adminMediaAssetsApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['AdminMediaAsset'],
  endpoints: (build) => ({
    listAdminMediaAssets: build.query<AdminMediaAssetsResponse, AdminMediaAssetsQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 50));
        if (q?.kind) params.set('kind', q.kind);
        if (q?.isActive !== undefined) params.set('isActive', String(q.isActive));
        if (q?.search) params.set('search', q.search);
        return { url: `/media-assets?${params.toString()}` };
      },
      providesTags: (result) => [
        'AdminMediaAsset',
        ...(result?.items.map((asset) => ({ type: 'AdminMediaAsset' as const, id: asset.id })) ?? []),
      ],
    }),
    createAdminMediaAsset: build.mutation<{ asset: AdminMediaAsset }, FormData>({
      query: (body) => ({ url: '/media-assets', method: 'POST', body }),
      invalidatesTags: ['AdminMediaAsset'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['MediaAssets']));
      },
    }),
    updateAdminMediaAsset: build.mutation<{ asset: AdminMediaAsset }, { id: string; body: Partial<AdminMediaAsset> }>({
      query: ({ id, body }) => ({ url: `/media-assets/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => ['AdminMediaAsset', { type: 'AdminMediaAsset', id }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['MediaAssets']));
      },
    }),
    deleteAdminMediaAsset: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/media-assets/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminMediaAsset'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['MediaAssets']));
      },
    }),
    reorderAdminMediaAsset: build.mutation<{ ok: true; moved: boolean }, { id: string; direction?: 'up' | 'down'; sortOrder?: number }>({
      query: ({ id, direction, sortOrder }) => ({ url: `/media-assets/${id}/reorder`, method: 'POST', body: { direction, sortOrder } }),
      invalidatesTags: ['AdminMediaAsset'],
    }),
  }),
});

export const {
  useListAdminMediaAssetsQuery,
  useCreateAdminMediaAssetMutation,
  useUpdateAdminMediaAssetMutation,
  useDeleteAdminMediaAssetMutation,
  useReorderAdminMediaAssetMutation,
} = adminMediaAssetsApi;
