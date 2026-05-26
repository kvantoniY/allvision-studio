import { createApi } from '@reduxjs/toolkit/query/react';
import { publicApi } from './public-api';
import { createBaseQueryWithReauth } from './base-query';

export type AdminTokenPackage = {
  id: string;
  title: string;
  subtitle: string | null;
  tokens: number;
  priceRub: number;
  originalPriceRub: number | null;
  bonus: number;
  badgeText: string | null;
  features: string[];
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type TokenPackageBody = {
  title?: string;
  subtitle?: string | null;
  tokens?: number;
  priceRub?: number;
  originalPriceRub?: number | null;
  bonus?: number;
  badgeText?: string | null;
  features?: string[];
  isPopular?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export const adminTokenPackagesApi = createApi({
  reducerPath: 'adminTokenPackagesApi',
  baseQuery: createBaseQueryWithReauth('/api/admin/token-packages'),
  tagTypes: ['AdminTokenPackages'],
  endpoints: (build) => ({
    listAdminTokenPackages: build.query<{ items: AdminTokenPackage[] }, void>({
      query: () => ({ url: '/' }),
      providesTags: ['AdminTokenPackages'],
    }),
    createAdminTokenPackage: build.mutation<{ item: AdminTokenPackage }, Required<Pick<TokenPackageBody, 'title' | 'tokens' | 'priceRub'>> & TokenPackageBody>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['AdminTokenPackages'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['TokenPackages']));
      },
    }),
    updateAdminTokenPackage: build.mutation<{ item: AdminTokenPackage }, { id: string; body: TokenPackageBody }>({
      query: ({ id, body }) => ({ url: `/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['AdminTokenPackages'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['TokenPackages']));
      },
    }),
    deleteAdminTokenPackage: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminTokenPackages'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['TokenPackages']));
      },
    }),
  }),
});

export const {
  useListAdminTokenPackagesQuery,
  useCreateAdminTokenPackageMutation,
  useUpdateAdminTokenPackageMutation,
  useDeleteAdminTokenPackageMutation,
} = adminTokenPackagesApi;
