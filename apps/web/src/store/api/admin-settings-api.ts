import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

export type AdminSettings = {
  usdToRub: number;
};

export const adminSettingsApi = createApi({
  reducerPath: 'adminSettingsApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['AdminSettings'],
  endpoints: (build) => ({
    getAdminSettings: build.query<{ settings: AdminSettings }, void>({
      query: () => ({ url: '/settings' }),
      providesTags: ['AdminSettings'],
    }),
    updateAdminSettings: build.mutation<{ settings: AdminSettings }, Partial<AdminSettings>>({
      query: (body) => ({ url: '/settings', method: 'PATCH', body }),
      invalidatesTags: ['AdminSettings'],
    }),
  }),
});

export const {
  useGetAdminSettingsQuery,
  useUpdateAdminSettingsMutation,
} = adminSettingsApi;
