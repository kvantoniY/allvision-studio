import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

export type AdminPromoCode = {
  id: string;
  code: string;
  description: string | null;
  source: string | null;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  /** Считается по фактически оплаченным пополнениям, а не по попыткам ввода. */
  stats: { uses: number; discountRub: number; paidRub: number };
};

export type AdminPromoUse = {
  id: string;
  createdAt: string;
  paymentId: string;
  discountRub: number;
  paidRub: number;
  user: { id: string; email: string; name: string | null };
};

export type PromoCodeInput = {
  code: string;
  description?: string | null;
  source?: string | null;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  maxUses?: number | null;
  isActive?: boolean;
  expiresAt?: string | null;
};

export const adminPromoCodesApi = createApi({
  reducerPath: 'adminPromoCodesApi',
  baseQuery: createBaseQueryWithReauth('/api/admin/promo-codes'),
  tagTypes: ['PromoCode'],
  endpoints: (build) => ({
    listPromoCodes: build.query<{ promoCodes: AdminPromoCode[] }, void>({
      query: () => ({ url: '/' }),
      providesTags: ['PromoCode'],
    }),
    listPromoUses: build.query<{ uses: AdminPromoUse[] }, string>({
      query: (id) => ({ url: `/${id}/uses` }),
      providesTags: (_r, _e, id) => [{ type: 'PromoCode', id: `uses-${id}` }],
    }),
    createPromoCode: build.mutation<{ promoCode: AdminPromoCode }, PromoCodeInput>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['PromoCode'],
    }),
    updatePromoCode: build.mutation<{ promoCode: AdminPromoCode }, { id: string } & Partial<PromoCodeInput>>({
      query: ({ id, ...body }) => ({ url: `/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['PromoCode'],
    }),
    deletePromoCode: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PromoCode'],
    }),
  }),
});

export const {
  useListPromoCodesQuery,
  useListPromoUsesQuery,
  useCreatePromoCodeMutation,
  useUpdatePromoCodeMutation,
  useDeletePromoCodeMutation,
} = adminPromoCodesApi;
