import { createApi } from '@reduxjs/toolkit/query/react';
import type { PayoutPeriodInput, TeacherPayoutDto, TeacherPayoutSummaryDto } from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';

export const adminPayoutsApi = createApi({
  reducerPath: 'adminPayoutsApi',
  baseQuery: createBaseQueryWithReauth('/api/admin/payouts'),
  tagTypes: ['Payout'],
  endpoints: (build) => ({
    listPayouts: build.query<{ period: PayoutPeriodInput; teachers: TeacherPayoutSummaryDto[] }, PayoutPeriodInput>({
      query: ({ periodStart, periodEnd }) => ({ url: `?periodStart=${periodStart}&periodEnd=${periodEnd}` }),
      providesTags: ['Payout'],
    }),
    preparePayout: build.mutation<{ payout: TeacherPayoutDto }, { teacherId: string; period: PayoutPeriodInput }>({
      query: ({ teacherId, period }) => ({ url: `/teachers/${teacherId}/prepare`, method: 'POST', body: period }),
      invalidatesTags: ['Payout'],
    }),
    payPayout: build.mutation<{ payout: TeacherPayoutDto }, { payoutId: string; proof: File }>({
      query: ({ payoutId, proof }) => {
        const form = new FormData();
        form.append('proof', proof);
        return { url: `/${payoutId}/pay`, method: 'POST', body: form };
      },
      invalidatesTags: ['Payout'],
    }),
    rejectPayout: build.mutation<{ payout: TeacherPayoutDto }, { payoutId: string; reason: string }>({
      query: ({ payoutId, reason }) => ({ url: `/${payoutId}/reject`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Payout'],
    }),
  }),
});

export const {
  useListPayoutsQuery,
  usePreparePayoutMutation,
  usePayPayoutMutation,
  useRejectPayoutMutation,
} = adminPayoutsApi;
