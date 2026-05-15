import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import { publicApi } from './public-api';
import type { HomeLandingContent } from '@/lib/home-landing-content';

export type AdminHomePageResponse = {
  content: Partial<HomeLandingContent> | null;
};

export const adminHomePageApi = createApi({
  reducerPath: 'adminHomePageApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['AdminHomePage'],
  endpoints: (build) => ({
    getAdminHomePageContent: build.query<AdminHomePageResponse, void>({
      query: () => ({ url: '/home-page' }),
      providesTags: ['AdminHomePage'],
    }),
    updateAdminHomePageContent: build.mutation<AdminHomePageResponse, { content: HomeLandingContent }>({
      query: (body) => ({ url: '/home-page', method: 'PUT', body }),
      invalidatesTags: ['AdminHomePage'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(publicApi.util.invalidateTags(['HomePage']));
      },
    }),
  }),
});

export const { useGetAdminHomePageContentQuery, useUpdateAdminHomePageContentMutation } = adminHomePageApi;
