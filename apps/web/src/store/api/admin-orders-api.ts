import { createApi } from '@reduxjs/toolkit/query/react';
import type { BriefField, CustomOrderStatus, OrderEmailTemplate } from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';

export type AdminOrderType = {
  id: string;
  slug: string;
  title: string;
  shortDesc: string;
  description: string;
  coverImage: string | null;
  previewVideo: string | null;
  briefFields: BriefField[];
  priceFromCoins: number;
  priceToCoins: number;
  leadTimeDays: number;
  emailTemplates: Partial<Record<CustomOrderStatus, OrderEmailTemplate>> | null;
  isActive: boolean;
  sortOrder: number;
  ordersCount: number;
};

export type AdminOrderListItem = {
  id: string;
  typeTitle: string;
  status: CustomOrderStatus;
  quotedPriceCoins: number | null;
  contactName: string;
  contactEmail: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string };
};

export type AdminOrderDetail = AdminOrderListItem & {
  brief: Record<string, unknown>;
  attachments: string[];
  contactPhone: string | null;
  contactMessenger: string | null;
  contactHandle: string | null;
  adminNote: string | null;
  resultUrl: string | null;
  user: { id: string; email: string; name: string | null; tokenBalance: number };
  orderType: { id: string; slug: string; title: string; briefFields: BriefField[]; priceFromCoins: number; priceToCoins: number } | null;
  messages: Array<{ id: string; body: string; fromAdmin: boolean; createdAt: string }>;
};

export type AdminOrderTypeInput = Partial<Omit<AdminOrderType, 'id' | 'ordersCount'>>;

export const adminOrdersApi = createApi({
  reducerPath: 'adminOrdersApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['AdminOrderType', 'AdminOrder'],
  endpoints: (build) => ({
    listAdminOrderTypes: build.query<{ items: AdminOrderType[] }, void>({
      query: () => ({ url: '/order-types' }),
      providesTags: ['AdminOrderType'],
    }),
    createAdminOrderType: build.mutation<{ item: AdminOrderType }, AdminOrderTypeInput>({
      query: (body) => ({ url: '/order-types', method: 'POST', body }),
      invalidatesTags: ['AdminOrderType'],
    }),
    updateAdminOrderType: build.mutation<{ item: AdminOrderType }, { id: string; body: AdminOrderTypeInput }>({
      query: ({ id, body }) => ({ url: `/order-types/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['AdminOrderType'],
    }),
    deleteAdminOrderType: build.mutation<void, string>({
      query: (id) => ({ url: `/order-types/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminOrderType'],
    }),

    listAdminOrders: build.query<
      { items: AdminOrderListItem[]; total: number },
      { status?: CustomOrderStatus } | void
    >({
      query: (q) => ({ url: q?.status ? `/orders?status=${q.status}` : '/orders' }),
      providesTags: ['AdminOrder'],
    }),
    getAdminOrder: build.query<{ order: AdminOrderDetail }, string>({
      query: (id) => ({ url: `/orders/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'AdminOrder', id }],
    }),
    setAdminOrderStatus: build.mutation<
      unknown,
      { id: string; status: CustomOrderStatus; note?: string; quotedPriceCoins?: number; resultUrl?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/orders/${id}/status`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { id }) => ['AdminOrder', { type: 'AdminOrder', id }],
    }),
    replyAdminOrder: build.mutation<unknown, { id: string; body: string }>({
      query: ({ id, body }) => ({ url: `/orders/${id}/messages`, method: 'POST', body: { body } }),
      invalidatesTags: (_result, _error, { id }) => ['AdminOrder', { type: 'AdminOrder', id }],
    }),
  }),
});

export const {
  useListAdminOrderTypesQuery,
  useCreateAdminOrderTypeMutation,
  useUpdateAdminOrderTypeMutation,
  useDeleteAdminOrderTypeMutation,
  useListAdminOrdersQuery,
  useGetAdminOrderQuery,
  useSetAdminOrderStatusMutation,
  useReplyAdminOrderMutation,
} = adminOrdersApi;
