import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import type { BlockCatalogItem } from '@allvision/shared';
import { publicApi } from './public-api';

// Category codes are now data-driven (ServiceCategoryDef table). Use the categories API to list.
export type ServiceCategory = string;

export type PipelineStep = {
  id: string;
  blockSlug: string;
  input?: unknown;
  params?: Record<string, unknown>;
};

export type UserInputField = {
  id: string;
  type:
    | 'text'
    | 'textarea'
    | 'photo'
    | 'video'
    | 'select'
    | 'media-select'
    | 'avatar'
    | 'tier'
    | 'audio'
    | 'duration'
    | 'aspect_ratio'
    | 'music-select';
  label: string;
  required: boolean;
  hint?: string;
  placeholder?: string;
  maxLength?: number;
  maxSizeMb?: number;
  maxDurationSec?: number;
  mediaKind?: string;
  allowedFormats?: string[];
  allowStudioAvatars?: boolean;
  allowSystemLibrary?: boolean;
  avatarTypes?: string[];
  options?: Array<{ label: string; value: string }>;
  durationOptions?: number[];
  defaultDuration?: number;
  aspectOptions?: Array<'auto' | '9:16' | '16:9' | '1:1' | '4:3' | '3:4'>;
  defaultAspect?: 'auto' | '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
  allowUserUpload?: boolean;
  allowLibrary?: boolean;
};

export type AdminService = {
  id: string;
  slug: string;
  title: string;
  shortDesc: string;
  description: string;
  category: ServiceCategory;
  priceTokens: number;
  pipelineConfig: PipelineStep[] | null;
  userInputForm: UserInputField[] | null;
  priceCoinsStandard: number | null;
  priceCoinsPro: number | null;
  previewImage: string | null;
  previewVideo: string | null;
  coverImage: string | null;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminServicesQuery = {
  page?: number;
  limit?: number;
  category?: ServiceCategory;
  isActive?: boolean;
  isFeatured?: boolean;
  search?: string;
};

export type AdminServicesResponse = {
  items: AdminService[];
  total: number;
  page: number;
  limit: number;
};

export const adminServicesApi = createApi({
  reducerPath: 'adminServicesApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['AdminService', 'AdminBlock'],
  endpoints: (build) => ({
    listAdminServices: build.query<AdminServicesResponse, AdminServicesQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 50));
        if (q?.category) params.set('category', q.category);
        if (q?.isActive !== undefined) params.set('isActive', String(q.isActive));
        if (q?.isFeatured !== undefined) params.set('isFeatured', String(q.isFeatured));
        if (q?.search) params.set('search', q.search);
        return { url: `/services?${params.toString()}` };
      },
      providesTags: (result) => [
        'AdminService',
        ...(result?.items.map((service) => ({ type: 'AdminService' as const, id: service.id })) ?? []),
      ],
    }),
    getAdminService: build.query<{ service: AdminService }, string>({
      query: (id) => ({ url: `/services/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'AdminService', id }],
    }),
    getAdminBlocks: build.query<{ blocks: BlockCatalogItem[] }, void>({
      query: () => ({ url: '/blocks' }),
      providesTags: ['AdminBlock'],
    }),
    createAdminService: build.mutation<{ service: AdminService }, FormData>({
      query: (body) => ({ url: '/services', method: 'POST', body }),
      invalidatesTags: ['AdminService'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['Services']));
      },
    }),
    updateAdminService: build.mutation<{ service: AdminService }, { id: string; body: FormData }>({
      query: ({ id, body }) => ({ url: `/services/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => ['AdminService', { type: 'AdminService', id }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['Services']));
      },
    }),
    deleteAdminService: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/services/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminService'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['Services']));
      },
    }),
    reorderAdminService: build.mutation<{ ok: true; moved: boolean }, { id: string; direction: 'up' | 'down' }>({
      query: ({ id, direction }) => ({ url: `/services/${id}/reorder`, method: 'POST', body: { direction } }),
      invalidatesTags: ['AdminService'],
    }),
    duplicateAdminService: build.mutation<{ service: AdminService }, string>({
      query: (id) => ({ url: `/services/${id}/duplicate`, method: 'POST' }),
      invalidatesTags: ['AdminService'],
    }),
    testRunAdminService: build.mutation<{ generationId: string; status: 'started' }, { id: string; userInputs?: Record<string, unknown>; selectedTier?: 'standard' | 'pro' }>({
      query: ({ id, ...body }) => ({ url: `/services/${id}/test-run`, method: 'POST', body }),
    }),
  }),
});

export const {
  useListAdminServicesQuery,
  useGetAdminServiceQuery,
  useGetAdminBlocksQuery,
  useCreateAdminServiceMutation,
  useUpdateAdminServiceMutation,
  useDeleteAdminServiceMutation,
  useReorderAdminServiceMutation,
  useDuplicateAdminServiceMutation,
  useTestRunAdminServiceMutation,
} = adminServicesApi;
