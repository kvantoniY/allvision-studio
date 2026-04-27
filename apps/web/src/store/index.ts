import { configureStore } from '@reduxjs/toolkit';
import { authApi } from './api/auth-api';
import { publicApi } from './api/public-api';
import { accountApi } from './api/account-api';
import { paymentsApi } from './api/payments-api';
import { projectsApi } from './api/projects-api';
import { authReducer } from './slices/auth-slice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
    [publicApi.reducerPath]: publicApi.reducer,
    [accountApi.reducerPath]: accountApi.reducer,
    [paymentsApi.reducerPath]: paymentsApi.reducer,
    [projectsApi.reducerPath]: projectsApi.reducer,
  },
  middleware: (getDefault) =>
    getDefault().concat(
      authApi.middleware,
      publicApi.middleware,
      accountApi.middleware,
      paymentsApi.middleware,
      projectsApi.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
