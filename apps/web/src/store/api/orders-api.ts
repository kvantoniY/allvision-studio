import { createApi } from '@reduxjs/toolkit/query/react';
import type { BriefField, CustomOrderStatus } from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';
import { accountApi } from './account-api';
import { authApi } from './auth-api';

export type PublicOrderType = {
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
};

export type OrderMessage = {
  id: string;
  body: string;
  fromAdmin: boolean;
  createdAt: string;
};

export type CustomOrderSummary = {
  id: string;
  typeTitle: string;
  status: CustomOrderStatus;
  quotedPriceCoins: number | null;
  resultUrl: string | null;
  createdAt: string;
  updatedAt: string;
  orderType: { slug: string; coverImage: string | null; leadTimeDays: number } | null;
};

export type CustomOrderDetail = CustomOrderSummary & {
  brief: Record<string, unknown>;
  attachments: string[];
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  adminNote: string | null;
  messages: OrderMessage[];
};

export type CreateOrderInput = {
  typeSlug: string;
  brief: Record<string, unknown>;
  attachments?: string[];
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  contactMessenger?: string;
  contactHandle?: string;
};

export const ordersApi = createApi({
  reducerPath: 'ordersApi',
  baseQuery: createBaseQueryWithReauth('/api'),
  tagTypes: ['Order', 'OrderTypes'],
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    listOrderTypes: build.query<{ items: PublicOrderType[] }, void>({
      query: () => ({ url: '/public/order-types' }),
      providesTags: ['OrderTypes'],
    }),
    listMyOrders: build.query<{ items: CustomOrderSummary[] }, void>({
      query: () => ({ url: '/user/orders' }),
      providesTags: ['Order'],
    }),
    getMyOrder: build.query<{ order: CustomOrderDetail }, string>({
      query: (id) => ({ url: `/user/orders/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Order', id }],
    }),
    createOrder: build.mutation<{ order: { id: string } }, CreateOrderInput>({
      query: (body) => ({ url: '/user/orders', method: 'POST', body }),
      invalidatesTags: ['Order'],
    }),
    uploadOrderAttachment: build.mutation<{ url: string }, File>({
      query: (file) => {
        const body = new FormData();
        body.append('file', file);
        return { url: '/user/orders/attachments', method: 'POST', body };
      },
    }),
    sendOrderMessage: build.mutation<{ order: CustomOrderDetail }, { id: string; body: string }>({
      query: ({ id, body }) => ({ url: `/user/orders/${id}/messages`, method: 'POST', body: { body } }),
      invalidatesTags: (_result, _error, { id }) => ['Order', { type: 'Order', id }],
    }),
    payOrder: build.mutation<{ status: string; price: number }, string>({
      query: (id) => ({ url: `/user/orders/${id}/pay`, method: 'POST' }),
      async onQueryStarted(_id, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        // Оплата списывает коины — баланс в шапке и история операций должны это увидеть.
        dispatch(accountApi.util.invalidateTags(['User', 'Dashboard', 'Transactions']));
        dispatch(authApi.util.invalidateTags(['Me', 'User']));
      },
      invalidatesTags: (_result, _error, id) => ['Order', { type: 'Order', id }],
    }),
  }),
});

export const {
  useListOrderTypesQuery,
  useListMyOrdersQuery,
  useGetMyOrderQuery,
  useCreateOrderMutation,
  useUploadOrderAttachmentMutation,
  useSendOrderMessageMutation,
  usePayOrderMutation,
} = ordersApi;
