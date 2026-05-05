import type { CoinTransaction, Generation, Role } from './generation';

export type AccountUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  coinBalance: number;
  emailVerified: boolean;
  freeAvatarUsed: boolean;
  freeVoiceUsed: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type DashboardStats = {
  totalGenerations: number;
  completedGenerations: number;
  processingGenerations: number;
  totalCoinsSpent: number;
};

export type DashboardResponse = {
  user: AccountUser;
  stats: DashboardStats;
  recentGenerations: Generation[];
  recentTransactions: CoinTransaction[];
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type TransactionsResponse = Paginated<CoinTransaction>;
export type UpdateProfileResponse = { user: AccountUser };
