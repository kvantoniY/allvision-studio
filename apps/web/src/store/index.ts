import { configureStore } from '@reduxjs/toolkit';
import { authApi } from './api/auth-api';
import { publicApi } from './api/public-api';
import { authReducer } from './slices/auth-slice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
    [publicApi.reducerPath]: publicApi.reducer,
  },
  middleware: (getDefault) => getDefault().concat(authApi.middleware, publicApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
