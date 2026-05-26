import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import type { User } from '@allvision/shared';
import type {
  LoginInput,
  RegisterInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '@allvision/shared';

type CaptchaBody = { captchaToken?: string };

export type SafeUser = Omit<
  User,
  'passwordHash' | 'passwordResetToken' | 'passwordResetExpiresAt' | 'emailVerifyToken' | 'emailVerifyExpiresAt'
>;

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: createBaseQueryWithReauth('/api/auth'),
  tagTypes: ['Me', 'User'],
  endpoints: (build) => ({
    register: build.mutation<{ user: SafeUser }, RegisterInput & CaptchaBody>({
      query: (body) => ({ url: '/register', method: 'POST', body }),
      invalidatesTags: ['Me', 'User'],
    }),
    login: build.mutation<{ user: SafeUser }, LoginInput & CaptchaBody>({
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
    forgotPassword: build.mutation<{ ok: true }, ForgotPasswordInput & CaptchaBody>({
      query: (body) => ({ url: '/forgot-password', method: 'POST', body }),
    }),
    resetPassword: build.mutation<{ ok: true }, ResetPasswordInput & CaptchaBody>({
      query: (body) => ({ url: '/reset-password', method: 'POST', body }),
    }),
    requestEmailVerification: build.mutation<{ ok: true; alreadyVerified?: boolean }, CaptchaBody | void>({
      query: (body) => ({ url: '/email-verification/request', method: 'POST', body: body ?? {} }),
      invalidatesTags: ['Me', 'User'],
    }),
    confirmEmailVerification: build.mutation<{ ok: true }, string>({
      query: (token) => ({ url: '/email-verification/confirm', method: 'POST', body: { token } }),
      invalidatesTags: ['Me', 'User'],
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
  useRequestEmailVerificationMutation,
  useConfirmEmailVerificationMutation,
} = authApi;
