import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  ContactInput,
  ContactResponse,
  PublicServiceResponse,
  PublicServicesResponse,
  PublicSettingsResponse,
  PublicTokenPackagesResponse,
  PublicTrendResponse,
  PublicTrendsResponse,
} from '@allvision/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const publicApi = createApi({
  reducerPath: 'publicApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_URL}/api/public`,
    credentials: 'include',
  }),
  tagTypes: ['Services', 'Trends', 'ScenarioTemplates', 'TokenPackages', 'PublicSettings'],
  endpoints: (build) => ({
    getServices: build.query<PublicServicesResponse, void>({
      query: () => ({ url: '/services' }),
      providesTags: ['Services'],
    }),
    getService: build.query<PublicServiceResponse, string>({
      query: (slug) => ({ url: `/services/${slug}` }),
      providesTags: (_result, _error, slug) => [{ type: 'Services', id: slug }],
    }),
    getTrends: build.query<PublicTrendsResponse, string[] | void>({
      query: (tags) => {
        const params = tags?.length ? `?tags=${encodeURIComponent(tags.join(','))}` : '';
        return { url: `/trends${params}` };
      },
      providesTags: ['Trends'],
    }),
    getTrend: build.query<PublicTrendResponse, string>({
      query: (id) => ({ url: `/trends/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Trends', id }],
    }),
    getTokenPackages: build.query<PublicTokenPackagesResponse, void>({
      query: () => ({ url: '/token-packages' }),
      providesTags: ['TokenPackages'],
    }),
    getPublicSettings: build.query<PublicSettingsResponse, void>({
      query: () => ({ url: '/settings/public' }),
      providesTags: ['PublicSettings'],
    }),
    sendContact: build.mutation<ContactResponse, ContactInput>({
      query: (body) => ({ url: '/contact', method: 'POST', body }),
    }),
  }),
});

export const {
  useGetServicesQuery,
  useGetServiceQuery,
  useGetTrendsQuery,
  useGetTrendQuery,
  useGetTokenPackagesQuery,
  useGetPublicSettingsQuery,
  useSendContactMutation,
} = publicApi;
