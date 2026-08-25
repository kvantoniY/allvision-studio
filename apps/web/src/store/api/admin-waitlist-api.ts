import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

export type AdminWaitlistLead = {
  id: string;
  topic: string;
  email: string;
  name: string | null;
  comment: string | null;
  userId: string | null;
  createdAt: string;
};

export type AdminWaitlistQuery = {
  topic?: string;
  page?: number;
  limit?: number;
};

export const adminWaitlistApi = createApi({
  reducerPath: 'adminWaitlistApi',
  baseQuery: createBaseQueryWithReauth('/api/admin/waitlist'),
  tagTypes: ['AdminWaitlist'],
  endpoints: (builder) => ({
    listAdminWaitlist: builder.query<
      { items: AdminWaitlistLead[]; total: number; page: number; limit: number },
      AdminWaitlistQuery | void
    >({
      query: (params) => {
        const search = new URLSearchParams();
        if (params?.topic) search.set('topic', params.topic);
        if (params?.page) search.set('page', String(params.page));
        if (params?.limit) search.set('limit', String(params.limit));
        const query = search.toString();
        return { url: query ? `/?${query}` : '/' };
      },
      providesTags: ['AdminWaitlist'],
    }),
    deleteAdminWaitlistLead: builder.mutation<void, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminWaitlist'],
    }),
  }),
});

export const { useListAdminWaitlistQuery, useDeleteAdminWaitlistLeadMutation } = adminWaitlistApi;
