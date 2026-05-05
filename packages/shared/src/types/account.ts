import type { CoinTransaction, Generation, Role } from './generation';

export type AccountUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  coinBalance: number;
  avatar?: string | null;
  tokenBalance?: number;
  createdAt: Date | string;
};

export type DashboardStats = {
  totalGenerations: number;
  completedGenerations: number;
  activeGenerations: number;
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
  totalPages: number;
};

export type TransactionsResponse = Paginated<CoinTransaction>;

export type UpdateProfileResponse = { user: AccountUser };
