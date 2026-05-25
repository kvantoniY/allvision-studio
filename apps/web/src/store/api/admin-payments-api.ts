import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

export type AdminPaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type AdminPaymentPurpose = 'TOPUP' | 'ORDER';

export type AdminPaymentListItem = {
  id: string;
  createdAt: string;
  paidAt: string | null;
  amountRub: number;
  tokensAdded: number | null;
  status: AdminPaymentStatus;
  provider: string;
  providerPaymentId: string | null;
  purpose: AdminPaymentPurpose;
  user: { id: string; email: string };
};

export type AdminPaymentDetail = AdminPaymentListItem & {
  metadata: unknown;
  user: { id: string; email: string; tokenBalance: number };
};

export type AdminPaymentsQuery = {
  page?: number;
  limit?: number;
  status?: AdminPaymentStatus;
  search?: string;
};

export type AdminPaymentsResponse = {
  items: AdminPaymentListItem[];
  total: number;
  page: number;
  limit: number;
};

export type AdminPaymentDetailResponse = {
  payment: AdminPaymentDetail;
  tokenTransaction: {
    id: string;
    amount: number;
    balanceAfter: number;
    createdAt: string;
  } | null;
};

export type PaymentsHealth = {
  provider: string;
  providerConfigured: boolean;
  merchantLogin: string | null;
  hashAlgorithm: string;
  isTestMode: boolean;
  poller: {
    enabled: boolean;
    intervalMs: number;
    reviveMaxAgeMs: number;
  };
  apiUptimeSeconds: number;
  apiVersion: string | null;
  pending: {
    total: number;
    oldest: { id: string; createdAt: string; providerPaymentId: string | null } | null;
    recent: Array<{
      id: string;
      createdAt: string;
      amountRub: number;
      providerPaymentId: string | null;
      user: { id: string; email: string };
    }>;
  };
  lastSuccess: { id: string; paidAt: string | null; providerPaymentId: string | null } | null;
  publicApiUrl: string | null;
  expectedResultUrl: string;
  expectedSuccessUrl: string;
};

export type RobokassaProbeResult = {
  ok: boolean;
  invId: string;
  providerStatus?: string;
  elapsedMs: number;
  error?: string;
  errorCode?: string;
};

export const adminPaymentsApi = createApi({
  reducerPath: 'adminPaymentsApi',
  baseQuery: createBaseQueryWithReauth('/api/admin/payments'),
  tagTypes: ['AdminPayment'],
  endpoints: (build) => ({
    listAdminPayments: build.query<AdminPaymentsResponse, AdminPaymentsQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 50));
        if (q?.status) params.set('status', q.status);
        if (q?.search) params.set('search', q.search);
        return { url: `?${params.toString()}` };
      },
      providesTags: (result) => [
        'AdminPayment',
        ...(result?.items.map((p) => ({ type: 'AdminPayment' as const, id: p.id })) ?? []),
      ],
    }),
    getAdminPayment: build.query<AdminPaymentDetailResponse, string>({
      query: (id) => ({ url: `/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'AdminPayment', id }],
    }),
    recheckAdminPayment: build.mutation<{ status: AdminPaymentStatus; tokensAdded: number | null }, string>({
      query: (id) => ({ url: `/${id}/recheck`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => ['AdminPayment', { type: 'AdminPayment', id }],
    }),
    confirmAdminPayment: build.mutation<{ status: AdminPaymentStatus; tokensAdded: number | null }, string>({
      query: (id) => ({ url: `/${id}/confirm`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => ['AdminPayment', { type: 'AdminPayment', id }],
    }),
    markAdminPaymentFailed: build.mutation<{ status: AdminPaymentStatus }, string>({
      query: (id) => ({ url: `/${id}/mark-failed`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => ['AdminPayment', { type: 'AdminPayment', id }],
    }),
  }),
});

export const {
  useListAdminPaymentsQuery,
  useGetAdminPaymentQuery,
  useRecheckAdminPaymentMutation,
  useConfirmAdminPaymentMutation,
  useMarkAdminPaymentFailedMutation,
} = adminPaymentsApi;
