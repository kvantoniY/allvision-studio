import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

let refreshPromise: Promise<unknown> | null = null;

function joinUrl(prefix: string, url: string) {
  const left = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const right = url.startsWith('/') ? url : `/${url}`;
  return `${left}${right}`;
}

function isAuthEndpoint(url: string) {
  return [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/logout',
    '/api/auth/refresh',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
  ].some((path) => url === path || url.startsWith(`${path}?`));
}

function enrichRateLimitError(result: { error?: FetchBaseQueryError; meta?: { response?: Response } }) {
  if (result.error?.status !== 429) return result;

  const retryAfter = Number(result.meta?.response?.headers.get('Retry-After'));
  if (!Number.isFinite(retryAfter) || retryAfter <= 0) return result;

  const data = result.error.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const body = data as { error?: Record<string, unknown> };
    body.error ??= { code: 'RATE_LIMITED', message: 'Слишком много запросов. Попробуйте позже.' };
    body.error.retryAfterSeconds ??= retryAfter;
    body.error.retryAt ??= new Date(Date.now() + retryAfter * 1000).toISOString();
  }

  return result;
}

export function createBaseQueryWithReauth(apiPrefix: string): BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> {
  const rawBaseQuery = fetchBaseQuery({
    baseUrl: API_URL,
    credentials: 'include',
  });

  return async (args, api, extraOptions) => {
    const normalizedArgs = typeof args === 'string'
      ? joinUrl(apiPrefix, args)
      : { ...args, url: joinUrl(apiPrefix, args.url) };
    let result = await rawBaseQuery(normalizedArgs, api, extraOptions);
    enrichRateLimitError(result);

    const requestUrl = typeof normalizedArgs === 'string' ? normalizedArgs : normalizedArgs.url;
    if (result.error?.status !== 401 || isAuthEndpoint(requestUrl)) {
      return result;
    }

    refreshPromise ??= Promise.resolve(rawBaseQuery({ url: '/api/auth/refresh', method: 'POST' }, api, extraOptions))
      .finally(() => {
        refreshPromise = null;
      });

    const refreshResult = await refreshPromise as { error?: FetchBaseQueryError };
    if (!refreshResult.error) {
      result = await rawBaseQuery(normalizedArgs, api, extraOptions);
      enrichRateLimitError(result);
    }

    return result;
  };
}
