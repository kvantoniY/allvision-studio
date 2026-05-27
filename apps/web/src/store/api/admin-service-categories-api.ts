import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import { publicApi } from './public-api';

export type AdminServiceCategory = {
  code: string;
  title: string;
  description: string | null;
  shortDescription: string | null;
  iconName: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
  servicesCount: number;
};

export type AdminServiceCategoryCreate = {
  code: string;
  title: string;
  description?: string | null;
  shortDescription?: string | null;
  iconName?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  isFeatured?: boolean;
};

export type AdminServiceCategoryUpdate = Partial<Omit<AdminServiceCategoryCreate, 'code'>>;

export const adminServiceCategoriesApi = createApi({
  reducerPath: 'adminServiceCategoriesApi',
  baseQuery: createBaseQueryWithReauth('/api/admin/service-categories'),
  tagTypes: ['AdminServiceCategory'],
  endpoints: (builder) => ({
    listAdminServiceCategories: builder.query<{ items: AdminServiceCategory[] }, void>({
      query: () => '/',
      providesTags: ['AdminServiceCategory'],
    }),
    createAdminServiceCategory: builder.mutation<{ category: AdminServiceCategory }, AdminServiceCategoryCreate>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['AdminServiceCategory'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(publicApi.util.invalidateTags(['ServiceCategories']));
        } catch {}
      },
    }),
    updateAdminServiceCategory: builder.mutation<{ category: AdminServiceCategory }, { code: string; data: AdminServiceCategoryUpdate }>({
      query: ({ code, data }) => ({ url: `/${code}`, method: 'PATCH', body: data }),
      invalidatesTags: ['AdminServiceCategory'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(publicApi.util.invalidateTags(['ServiceCategories']));
        } catch {}
      },
    }),
    deleteAdminServiceCategory: builder.mutation<void, string>({
      query: (code) => ({ url: `/${code}`, method: 'DELETE' }),
      invalidatesTags: ['AdminServiceCategory'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(publicApi.util.invalidateTags(['ServiceCategories']));
        } catch {}
      },
    }),
    reorderAdminServiceCategories: builder.mutation<{ items: AdminServiceCategory[] }, string[]>({
      query: (orderedCodes) => ({ url: '/reorder', method: 'POST', body: { orderedCodes } }),
      invalidatesTags: ['AdminServiceCategory'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(publicApi.util.invalidateTags(['ServiceCategories']));
        } catch {}
      },
    }),
  }),
});

export const {
  useListAdminServiceCategoriesQuery,
  useCreateAdminServiceCategoryMutation,
  useUpdateAdminServiceCategoryMutation,
  useDeleteAdminServiceCategoryMutation,
  useReorderAdminServiceCategoriesMutation,
} = adminServiceCategoriesApi;
