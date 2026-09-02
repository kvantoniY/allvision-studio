import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import type { Payment, PaymentStatus } from '@allvision/shared';
import { accountApi } from './account-api';
import { authApi } from './auth-api';

export type CreatePaymentResponse = {
  payment: Pick<Payment, 'id' | 'amountRub' | 'tokensAdded' | 'expiresAt'>;
  confirmationUrl: string;
  confirmationMethod?: 'GET' | 'POST';
  confirmationParams?: Record<string, string>;
};

export const paymentsApi = createApi({
  reducerPath: 'paymentsApi',
  baseQuery: createBaseQueryWithReauth('/api/payments'),
  tagTypes: ['Payment'],
  endpoints: (build) => ({
    /** Проверка промокода до оплаты: ничего не списывает и лимит кода не расходует. */
    checkPromoCode: build.mutation<
      { promo: { code: string; discountType: 'PERCENT' | 'FIXED'; discountValue: number; description: string | null } },
      { code: string }
    >({
      query: (body) => ({ url: '/promo/check', method: 'POST', body }),
    }),
    topup: build.mutation<CreatePaymentResponse, { tokenPackageId: string; promoCode?: string }>({
      query: (body) => ({ url: '/topup', method: 'POST', body }),
      invalidatesTags: ['Payment'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(accountApi.util.invalidateTags(['Payments']));
      },
    }),
    payOrder: build.mutation<CreatePaymentResponse, { orderId: string }>({
      query: ({ orderId }) => ({ url: `/order/${orderId}`, method: 'POST' }),
      invalidatesTags: ['Payment'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(accountApi.util.invalidateTags(['Payments', 'Dashboard']));
      },
    }),
    getPayment: build.query<Payment, string>({
      query: (id) => ({ url: `/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Payment', id }],
    }),
    getPaymentStatus: build.query<{ status: PaymentStatus; tokensAdded: number | null; expiresAt: string | Date | null }, string>({
      query: (id) => ({ url: `/${id}/status` }),
      providesTags: (_result, _error, id) => [{ type: 'Payment', id }],
    }),
    recheckPayment: build.mutation<
      { status: PaymentStatus; tokensAdded: number | null; expiresAt: string | Date | null; providerStatus: string | null },
      string
    >({
      query: (id) => ({ url: `/${id}/recheck`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Payment', id }],
    }),
  }),
});

type InvalidateAction =
  | ReturnType<typeof accountApi.util.invalidateTags>
  | ReturnType<typeof authApi.util.invalidateTags>;

export function invalidatePaymentSideEffects(dispatch: (action: InvalidateAction) => unknown) {
  dispatch(accountApi.util.invalidateTags(['User', 'Dashboard', 'Payments', 'Transactions']));
  dispatch(authApi.util.invalidateTags(['Me', 'User']));
}

export const {
  useCheckPromoCodeMutation,
  useTopupMutation,
  usePayOrderMutation,
  useGetPaymentQuery,
  useGetPaymentStatusQuery,
  useRecheckPaymentMutation,
} = paymentsApi;
