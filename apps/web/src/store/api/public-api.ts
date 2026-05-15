import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import type { HomeLandingContent } from '@/lib/home-landing-content';
import type {
  ContactInput,
  ContactResponse,
  PublicServiceResponse,
  PublicServicesResponse,
  PublicSettingsResponse,
  PublicMediaAssetsResponse,
  PublicStylePresetsResponse,
  PublicTokenPackagesResponse,
  PublicTrendResponse,
  PublicTrendsResponse,
} from '@allvision/shared';

export type PublicHomePageResponse = {
  content: Partial<HomeLandingContent> | null;
};

export const publicApi = createApi({
  reducerPath: 'publicApi',
  baseQuery: createBaseQueryWithReauth('/api/public'),
  tagTypes: ['Services', 'Trends', 'ScenarioTemplates', 'TokenPackages', 'PublicSettings', 'MediaAssets', 'StylePresets', 'HomePage'],
  endpoints: (build) => ({
    getHomePageContent: build.query<PublicHomePageResponse, void>({
      query: () => ({ url: '/home-page' }),
      providesTags: ['HomePage'],
    }),
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
    getPublicMediaAssets: build.query<PublicMediaAssetsResponse, { kind?: string; active?: boolean } | void>({
      query: (q) => {
        const params = new URLSearchParams();
        if (q?.kind) params.set('kind', q.kind);
        if (q?.active !== undefined) params.set('active', String(q.active));
        const query = params.toString();
        return { url: `/media-assets${query ? `?${query}` : ''}` };
      },
      providesTags: ['MediaAssets'],
    }),
    getStylePresets: build.query<PublicStylePresetsResponse, { kind?: 'user-avatar' | 'user-location' } | void>({
      query: (q) => {
        const params = new URLSearchParams();
        if (q?.kind) params.set('kind', q.kind);
        const query = params.toString();
        return { url: `/style-presets${query ? `?${query}` : ''}` };
      },
      providesTags: ['StylePresets'],
    }),
    sendContact: build.mutation<ContactResponse, ContactInput>({
      query: (body) => ({ url: '/contact', method: 'POST', body }),
    }),
  }),
});

export const {
  useGetServicesQuery,
  useGetHomePageContentQuery,
  useGetServiceQuery,
  useGetTrendsQuery,
  useGetTrendQuery,
  useGetTokenPackagesQuery,
  useGetPublicSettingsQuery,
  useGetPublicMediaAssetsQuery,
  useGetStylePresetsQuery,
  useSendContactMutation,
} = publicApi;
