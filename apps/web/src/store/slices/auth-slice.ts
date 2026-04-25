import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SafeUser } from '../api/auth-api';

interface AuthState {
  user: SafeUser | null;
  isAuthLoading: boolean;
}

const initialState: AuthState = {
  user: null,
  isAuthLoading: true,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<SafeUser | null>) {
      state.user = action.payload;
      state.isAuthLoading = false;
    },
    clearUser(state) {
      state.user = null;
      state.isAuthLoading = false;
    },
    setAuthLoading(state, action: PayloadAction<boolean>) {
      state.isAuthLoading = action.payload;
    },
  },
});

export const { setUser, clearUser, setAuthLoading } = authSlice.actions;
export const authReducer = authSlice.reducer;
