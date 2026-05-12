import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import type { User } from '@allvision/shared';
import type {
  LoginInput,
  RegisterInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '@allvision/shared';

export type SafeUser = Omit<User, 'passwordHash' | 'passwordResetToken' | 'passwordResetExpiresAt'>;

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: createBaseQueryWithReauth('/api/auth'),
  tagTypes: ['Me', 'User'],
  endpoints: (build) => ({
    register: build.mutation<{ user: SafeUser }, RegisterInput>({
      query: (body) => ({ url: '/register', method: 'POST', body }),
      invalidatesTags: ['Me', 'User'],
    }),
    login: build.mutation<{ user: SafeUser }, LoginInput>({
      query: (body) => ({ url: '/login', method: 'POST', body }),
      invalidatesTags: ['Me', 'User'],
    }),
    logout: build.mutation<{ ok: true }, void>({
      query: () => ({ url: '/logout', method: 'POST' }),
      invalidatesTags: ['Me', 'User'],
    }),
    getMe: build.query<{ user: SafeUser }, void>({
      query: () => ({ url: '/me' }),
      providesTags: ['Me', 'User'],
    }),
    forgotPassword: build.mutation<{ ok: true }, ForgotPasswordInput>({
      query: (body) => ({ url: '/forgot-password', method: 'POST', body }),
    }),
    resetPassword: build.mutation<{ ok: true }, ResetPasswordInput>({
      query: (body) => ({ url: '/reset-password', method: 'POST', body }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useLogoutMutation,
  useGetMeQuery,
  useForgotPasswordMutation,
  useResetPasswordMutation,
} = authApi;
