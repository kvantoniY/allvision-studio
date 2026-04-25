'use client';

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useGetMeQuery, useLogoutMutation } from '@/store/api/auth-api';
import { setUser, clearUser, setAuthLoading } from '@/store/slices/auth-slice';
import type { RootState, AppDispatch } from '@/store';

export function useAuth() {
  const dispatch = useDispatch<AppDispatch>();
  const { user, isAuthLoading } = useSelector((s: RootState) => s.auth);

  const { data, error, isLoading, isFetching } = useGetMeQuery(undefined, {
    skip: user !== null,
  });
  const [logoutMutation] = useLogoutMutation();

  useEffect(() => {
    if (isLoading || isFetching) {
      dispatch(setAuthLoading(true));
      return;
    }
    if (data?.user) {
      dispatch(setUser(data.user));
    } else if (error) {
      dispatch(clearUser());
    } else if (user === null) {
      dispatch(setAuthLoading(false));
    }
  }, [data, error, isLoading, isFetching, user, dispatch]);

  const logout = async () => {
    await logoutMutation().unwrap().catch(() => undefined);
    dispatch(clearUser());
  };

  return {
    user,
    isLoading: isAuthLoading,
    isAuthenticated: !!user,
    logout,
  };
}
