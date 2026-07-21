import { createApi } from '@reduxjs/toolkit/query/react';
import type {
  AcademyAssetDto,
  AcademyGenerationChildDto,
  AcademyGenerationInput,
  AcademyGenerationStatusDto,
  AcademyLibraryScope,
} from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';

export type AcademyLibraryQuery = {
  scope: AcademyLibraryScope;
  childId?: string;
  kind?: string;
  search?: string;
};

export const academyMaterialsApi = createApi({
  reducerPath: 'academyMaterialsApi',
  baseQuery: createBaseQueryWithReauth('/api/academy/materials'),
  tagTypes: ['Library', 'Generation'],
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    getGenerationModels: build.query<{ models: Array<{ slug: string; estimatedCostUsd: number }> }, void>({
      query: () => ({ url: '/models' }),
    }),
    getGenerationChildren: build.query<{ items: AcademyGenerationChildDto[] }, void>({
      query: () => ({ url: '/children' }),
    }),
    getAcademyLibrary: build.query<{ items: AcademyAssetDto[] }, AcademyLibraryQuery>({
      query: ({ scope, childId, kind, search }) => {
        const params = new URLSearchParams();
        if (childId) params.set('childId', childId);
        if (kind) params.set('kind', kind);
        if (search) params.set('search', search);
        const suffix = params.toString();
        return { url: `/library/${scope}${suffix ? `?${suffix}` : ''}` };
      },
      providesTags: ['Library'],
    }),
    estimateAcademyGeneration: build.mutation<{ estimatedCostUsd: number }, AcademyGenerationInput>({
      query: (body) => ({ url: '/estimate', method: 'POST', body }),
    }),
    generateAcademyMaterial: build.mutation<{ generation: AcademyGenerationStatusDto }, AcademyGenerationInput>({
      query: (body) => ({ url: '/generate', method: 'POST', body }),
      invalidatesTags: ['Generation'],
    }),
    getAcademyGeneration: build.query<{ generation: AcademyGenerationStatusDto }, string>({
      query: (projectId) => ({ url: `/generations/${projectId}` }),
      providesTags: ['Generation'],
    }),
    updateAcademyAsset: build.mutation<
      { ok: true },
      { scope: AcademyLibraryScope; id: string; body: { title?: string; description?: string | null; tags?: string[] } }
    >({
      query: ({ scope, id, body }) => ({ url: `/library/${scope}/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Library'],
    }),
    deleteAcademyAsset: build.mutation<{ ok: true }, { scope: AcademyLibraryScope; id: string }>({
      query: ({ scope, id }) => ({ url: `/library/${scope}/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Library'],
    }),
    promoteAcademyAsset: build.mutation<{ asset: AcademyAssetDto }, { sourceScope: 'teacher' | 'child'; assetId: string }>({
      query: (body) => ({ url: '/promote', method: 'POST', body }),
      invalidatesTags: ['Library'],
    }),
  }),
});

export const {
  useGetGenerationModelsQuery,
  useGetGenerationChildrenQuery,
  useGetAcademyLibraryQuery,
  useEstimateAcademyGenerationMutation,
  useGenerateAcademyMaterialMutation,
  useGetAcademyGenerationQuery,
  useUpdateAcademyAssetMutation,
  useDeleteAcademyAssetMutation,
  usePromoteAcademyAssetMutation,
} = academyMaterialsApi;
