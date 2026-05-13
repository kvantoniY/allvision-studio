import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'READONLY_ADMIN';
  tokenBalance: number;
  deletedAt: string | null;
  createdAt: string;
  lastActivityAt: string;
  _count: { projects: number };
  projects?: Array<{ id: string; title: string; status: string; progress: number; tokensCost: number; createdAt: string; service: { id: string; slug: string; title: string } | null }>;
  tokenTxns?: Array<{ id: string; amount: number; reason: string; refId: string | null; balanceAfter: number; createdAt: string }>;
};

export type AdminUsersQuery = {
  page?: number;
  limit?: number;
  role?: AdminUser['role'];
  status?: 'active' | 'deleted';
  search?: string;
};

export type AdminUsersResponse = {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
};

export const adminUsersApi = createApi({
  reducerPath: 'adminUsersApi',
  baseQuery: createBaseQueryWithReauth('/api/admin'),
  tagTypes: ['AdminUser'],
  endpoints: (build) => ({
    listAdminUsers: build.query<AdminUsersResponse, AdminUsersQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 50));
        if (q?.role) params.set('role', q.role);
        if (q?.status) params.set('status', q.status);
        if (q?.search) params.set('search', q.search);
        return { url: `/users?${params.toString()}` };
      },
      providesTags: (result) => [
        'AdminUser',
        ...(result?.items.map((user) => ({ type: 'AdminUser' as const, id: user.id })) ?? []),
      ],
    }),
    getAdminUser: build.query<{ user: AdminUser }, string>({
      query: (id) => ({ url: `/users/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'AdminUser', id }],
    }),
    updateAdminUser: build.mutation<{ user: AdminUser }, { id: string; tokenBalance: number }>({
      query: ({ id, tokenBalance }) => ({ url: `/users/${id}`, method: 'PATCH', body: { tokenBalance } }),
      invalidatesTags: (_result, _error, { id }) => ['AdminUser', { type: 'AdminUser', id }],
    }),
  }),
});

export const {
  useListAdminUsersQuery,
  useGetAdminUserQuery,
  useUpdateAdminUserMutation,
} = adminUsersApi;
