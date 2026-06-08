import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import type {
  DashboardResponse,
  PaymentsResponse,
  TransactionsResponse,
  UpdateProfileInput,
  UpdateProfileResponse,
  ChangeAccountPasswordInput,
  DeleteAccountInput,
} from '@allvision/shared';

export type TransactionsQuery = {
  page?: number;
  limit?: number;
  type?: 'all' | 'topup' | 'spending';
};

export type PaymentsQuery = {
  page?: number;
  limit?: number;
};

export const accountApi = createApi({
  reducerPath: 'accountApi',
  baseQuery: createBaseQueryWithReauth('/api/account'),
  tagTypes: ['User', 'Dashboard', 'Transactions', 'Payments'],
  endpoints: (build) => ({
    getDashboard: build.query<DashboardResponse, void>({
      query: () => ({ url: '/dashboard' }),
      providesTags: ['Dashboard', 'User'],
    }),
    getTransactions: build.query<TransactionsResponse, TransactionsQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 20));
        if (q?.type && q.type !== 'all') params.set('type', q.type);
        return { url: `/transactions?${params.toString()}` };
      },
      providesTags: ['Transactions'],
    }),
    getPayments: build.query<PaymentsResponse, PaymentsQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 20));
        return { url: `/payments?${params.toString()}` };
      },
      providesTags: ['Payments'],
    }),
    updateProfile: build.mutation<UpdateProfileResponse, UpdateProfileInput>({
      query: (body) => ({ url: '/profile', method: 'PATCH', body }),
      invalidatesTags: ['User', 'Dashboard'],
    }),
    uploadProfileAvatar: build.mutation<UpdateProfileResponse & { avatar: string }, FormData>({
      query: (body) => ({ url: '/profile/avatar', method: 'POST', body }),
      invalidatesTags: ['User', 'Dashboard'],
    }),
    changePassword: build.mutation<{ ok: true }, ChangeAccountPasswordInput>({
      query: (body) => ({ url: '/profile/password', method: 'POST', body }),
    }),
    deleteAccount: build.mutation<{ ok: true }, DeleteAccountInput>({
      query: (body) => ({ url: '/', method: 'DELETE', body }),
    }),
  }),
});

export const {
  useGetDashboardQuery,
  useGetTransactionsQuery,
  useGetPaymentsQuery,
  useUpdateProfileMutation,
  useUploadProfileAvatarMutation,
  useChangePasswordMutation,
  useDeleteAccountMutation,
} = accountApi;
