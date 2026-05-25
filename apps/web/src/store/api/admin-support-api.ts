import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import type { SupportTicket, SupportTicketStatus, SupportTicketsResponse } from './support-api';

export type AdminSupportTicketsQuery = {
  page?: number;
  limit?: number;
  status?: SupportTicketStatus;
  search?: string;
};

export const adminSupportApi = createApi({
  reducerPath: 'adminSupportApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['AdminSupportTickets', 'AdminSupportTicket'],
  endpoints: (build) => ({
    listAdminSupportTickets: build.query<SupportTicketsResponse, AdminSupportTicketsQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 50));
        if (q?.status) params.set('status', q.status);
        if (q?.search) params.set('search', q.search);
        return { url: `/support/tickets?${params.toString()}` };
      },
      providesTags: (result) => [
        'AdminSupportTickets',
        ...(result?.items.map((ticket) => ({ type: 'AdminSupportTicket' as const, id: ticket.id })) ?? []),
      ],
    }),
    getAdminSupportTicket: build.query<{ ticket: SupportTicket }, string>({
      query: (id) => ({ url: `/support/tickets/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'AdminSupportTicket', id }],
    }),
    addAdminSupportMessage: build.mutation<{ ticket: SupportTicket }, { id: string; body: FormData }>({
      query: ({ id, body }) => ({ url: `/support/tickets/${id}/messages`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { id }) => ['AdminSupportTickets', { type: 'AdminSupportTicket', id }],
    }),
    resolveAdminSupportTicket: build.mutation<{ ticket: SupportTicket }, string>({
      query: (id) => ({ url: `/support/tickets/${id}/resolve`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => ['AdminSupportTickets', { type: 'AdminSupportTicket', id }],
    }),
  }),
});

export const {
  useListAdminSupportTicketsQuery,
  useGetAdminSupportTicketQuery,
  useAddAdminSupportMessageMutation,
  useResolveAdminSupportTicketMutation,
} = adminSupportApi;
