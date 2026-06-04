import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import { authApi } from './auth-api';
import { projectsApi } from './projects-api';

export type UserMediaKind = 'user-avatar' | 'user-location';

export type UserMediaAsset = {
  id: string;
  createdAt: string;
  updatedAt: string;
  kind: UserMediaKind;
  title: string;
  description: string | null;
  tags: string[];
  storageKey: string;
  publicUrl: string;
  thumbnailKey: string | null;
  thumbnailUrl?: string | null;
  ownerUserId: string;
  parentAssetId: string | null;
  variationsCount: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  frameCount: number | null;
  fileSize: number;
  mimeType: string;
  isActive: boolean;
  sortOrder: number;
  variations?: UserMediaAsset[];
};

export type UserMediaAssetsQuery = {
  page?: number;
  limit?: number;
  kind?: UserMediaKind;
  tag?: string;
  search?: string;
};

export type UserMediaAssetsResponse = {
  items: UserMediaAsset[];
  total: number;
  page: number;
  limit: number;
};

export type GenerateUserMediaAssetBody = {
  kind: UserMediaKind;
  prompt: string;
  title: string;
  model?: 'nano-banana' | 'gpt-image-2';
  aspectRatio?: '1:1' | '9:16' | '16:9' | 'auto';
  parentAssetId?: string;
};

export type SaveProjectToStudioBody = {
  projectId: string;
  kind: UserMediaKind;
  title: string;
  tags?: string[];
  description?: string;
};

export const userMediaAssetsApi = createApi({
  reducerPath: 'userMediaAssetsApi',
  baseQuery: createBaseQueryWithReauth('/api/user/media-assets'),
  tagTypes: ['UserMediaAsset'],
  endpoints: (build) => ({
    listUserMediaAssets: build.query<UserMediaAssetsResponse, UserMediaAssetsQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 50));
        if (q?.kind) params.set('kind', q.kind);
        if (q?.tag) params.set('tag', q.tag);
        if (q?.search) params.set('search', q.search);
        return { url: `/?${params.toString()}` };
      },
      providesTags: (result) => [
        'UserMediaAsset',
        ...(result?.items.map((asset) => ({ type: 'UserMediaAsset' as const, id: asset.id })) ?? []),
      ],
    }),
    getUserMediaAsset: build.query<{ asset: UserMediaAsset }, string>({
      query: (id) => ({ url: `/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'UserMediaAsset', id }],
    }),
    createUserMediaAsset: build.mutation<{ asset: UserMediaAsset }, FormData>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['UserMediaAsset'],
    }),
    updateUserMediaAsset: build.mutation<{ asset: UserMediaAsset }, { id: string; body: Partial<Pick<UserMediaAsset, 'title' | 'description' | 'tags'>> }>({
      query: ({ id, body }) => ({ url: `/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => ['UserMediaAsset', { type: 'UserMediaAsset', id }],
    }),
    deleteUserMediaAsset: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['UserMediaAsset'],
    }),
    generateUserMediaAsset: build.mutation<{ project: { id: string; status: string; progress: number; tokensCost: number; title: string } }, GenerateUserMediaAssetBody>({
      query: (body) => ({ url: '/generate', method: 'POST', body: { ...body, model: body.model ?? 'nano-banana' } }),
      invalidatesTags: ['UserMediaAsset'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(authApi.util.invalidateTags(['Me', 'User']));
        dispatch(projectsApi.util.invalidateTags(['Project']));
      },
    }),
    saveProjectToStudio: build.mutation<{ asset: UserMediaAsset }, SaveProjectToStudioBody>({
      query: (body) => ({ url: '/save-from-project', method: 'POST', body }),
      invalidatesTags: ['UserMediaAsset'],
    }),
  }),
});

export const {
  useListUserMediaAssetsQuery,
  useGetUserMediaAssetQuery,
  useCreateUserMediaAssetMutation,
  useUpdateUserMediaAssetMutation,
  useDeleteUserMediaAssetMutation,
  useGenerateUserMediaAssetMutation,
  useSaveProjectToStudioMutation,
} = userMediaAssetsApi;
