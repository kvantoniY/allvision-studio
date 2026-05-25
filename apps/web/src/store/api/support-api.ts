import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

export type SupportTicketStatus = 'OPEN' | 'RESOLVED';
export type SupportAttachmentKind = 'IMAGE' | 'FILE';

export type SupportUser = {
  id: string;
  email: string;
  name: string | null;
  role?: 'USER' | 'ADMIN' | 'READONLY_ADMIN';
};

export type SupportAttachment = {
  id: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  publicUrl: string;
  kind: SupportAttachmentKind;
  createdAt: string;
};

export type SupportMessage = {
  id: string;
  ticketId: string;
  authorId: string;
  body: string | null;
  createdAt: string;
  author: SupportUser;
  attachments: SupportAttachment[];
};

export type SupportTicket = {
  id: string;
  userId: string;
  subject: string;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  user: SupportUser;
  resolvedBy: SupportUser | null;
  messages: SupportMessage[];
  _count?: { messages: number };
};

export type SupportTicketsResponse = {
  items: SupportTicket[];
  total: number;
  page: number;
  limit: number;
};

export type SupportTicketsQuery = {
  page?: number;
  limit?: number;
  status?: SupportTicketStatus;
};

export const supportApi = createApi({
  reducerPath: 'supportApi',
  baseQuery: createBaseQueryWithReauth('/api/support'),
  tagTypes: ['SupportTickets', 'SupportTicket'],
  endpoints: (build) => ({
    listSupportTickets: build.query<SupportTicketsResponse, SupportTicketsQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 20));
        if (q?.status) params.set('status', q.status);
        return { url: `/tickets?${params.toString()}` };
      },
      providesTags: (result) => [
        'SupportTickets',
        ...(result?.items.map((ticket) => ({ type: 'SupportTicket' as const, id: ticket.id })) ?? []),
      ],
    }),
    getSupportTicket: build.query<{ ticket: SupportTicket }, string>({
      query: (id) => ({ url: `/tickets/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'SupportTicket', id }],
    }),
    createSupportTicket: build.mutation<{ ticket: SupportTicket }, FormData>({
      query: (body) => ({ url: '/tickets', method: 'POST', body }),
      invalidatesTags: ['SupportTickets'],
    }),
    addSupportMessage: build.mutation<{ ticket: SupportTicket }, { id: string; body: FormData }>({
      query: ({ id, body }) => ({ url: `/tickets/${id}/messages`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { id }) => ['SupportTickets', { type: 'SupportTicket', id }],
    }),
    resolveSupportTicket: build.mutation<{ ticket: SupportTicket }, string>({
      query: (id) => ({ url: `/tickets/${id}/resolve`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => ['SupportTickets', { type: 'SupportTicket', id }],
    }),
  }),
});

export const {
  useListSupportTicketsQuery,
  useGetSupportTicketQuery,
  useCreateSupportTicketMutation,
  useAddSupportMessageMutation,
  useResolveSupportTicketMutation,
} = supportApi;
