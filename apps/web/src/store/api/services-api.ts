import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { PublicService, ServiceCategory } from '@allvision/shared';
import { accountApi } from './account-api';
import { authApi } from './auth-api';
import { projectsApi, invalidateProjectSideEffects } from './projects-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ServicesQuery = {
  category?: ServiceCategory;
  featured?: boolean;
};

export type LaunchServiceInput = {
  slug: string;
  formData: FormData;
};

export type LaunchServiceResponse = {
  project: {
    id: string;
    status: string;
    progress: number;
    tokensCost: number;
    createdAt: string;
    serviceId: string | null;
    title: string;
  };
};

export const servicesApi = createApi({
  reducerPath: 'servicesApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_URL}/api/services`,
    credentials: 'include',
  }),
  tagTypes: ['Services'],
  endpoints: (build) => ({
    listServices: build.query<{ services: PublicService[] }, ServicesQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        if (q?.category) params.set('category', q.category);
        if (q?.featured !== undefined) params.set('featured', String(q.featured));
        const query = params.toString();
        return { url: query ? `/?${query}` : '/' };
      },
      providesTags: ['Services'],
    }),
    getService: build.query<{ service: PublicService }, string>({
      query: (slug) => ({ url: `/${slug}` }),
      providesTags: (_result, _error, slug) => [{ type: 'Services', id: slug }],
    }),
    launchService: build.mutation<LaunchServiceResponse, LaunchServiceInput>({
      query: ({ slug, formData }) => ({
        url: `/${slug}/launch`,
        method: 'POST',
        body: formData,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        invalidateProjectSideEffects(dispatch);
        dispatch(accountApi.util.invalidateTags(['User', 'Dashboard', 'Transactions']));
        dispatch(authApi.util.invalidateTags(['Me', 'User']));
        dispatch(projectsApi.util.invalidateTags(['Project', 'ProjectStatus']));
      },
    }),
  }),
});

export const {
  useListServicesQuery,
  useGetServiceQuery,
  useLaunchServiceMutation,
} = servicesApi;
